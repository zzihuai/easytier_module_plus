#!/usr/bin/env python3
import json
import os
import pathlib
import platform
import shutil
import subprocess
import tempfile
import time
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class ModuleRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory(prefix='easytier-tests-')
        self.module_directory = pathlib.Path(self.temporary_directory.name) / 'module'
        self.module_directory.mkdir()
        for filename in ['common.sh', 'control.sh']:
            shutil.copy2(ROOT / 'module' / filename, self.module_directory / filename)
        (self.module_directory / 'config').mkdir()
        (self.module_directory / 'module.prop').write_text('version=test\n', encoding='utf-8')
        self.process_environment = os.environ.copy()
        if platform.system() != 'Linux':
            fake_command_directory = pathlib.Path(self.temporary_directory.name) / 'fake-commands'
            fake_command_directory.mkdir()
            fake_pgrep = fake_command_directory / 'pgrep'
            fake_pgrep.write_text('#!/bin/sh\nexit 1\n', encoding='utf-8')
            fake_pgrep.chmod(0o755)
            self.process_environment['PATH'] = f'{fake_command_directory}:{self.process_environment["PATH"]}'

    def tearDown(self):
        self.temporary_directory.cleanup()

    def run_control(self, *arguments):
        return subprocess.run(
            ['sh', str(self.module_directory / 'control.sh'), *arguments],
            env=self.process_environment,
            text=True,
            capture_output=True,
        )

    def get_config_state(self):
        result = self.run_control('status')
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)['config_state']

    def test_status_distinguishes_missing_empty_whitespace_and_present_config(self):
        config_path = self.module_directory / 'config/config.toml'
        self.assertEqual(self.get_config_state(), 'missing')

        config_path.write_text('', encoding='utf-8')
        self.assertEqual(self.get_config_state(), 'empty')

        config_path.write_text(' \n\t\n', encoding='utf-8')
        self.assertEqual(self.get_config_state(), 'empty')

        config_path.write_text('instance_name = "test"\n', encoding='utf-8')
        self.assertEqual(self.get_config_state(), 'present')

    def test_start_and_restart_reject_missing_or_empty_config(self):
        for command in ['start-core', 'restart-core']:
            result = self.run_control(command)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('配置不存在或为空', result.stdout)

        config_path = self.module_directory / 'config/config.toml'
        config_path.write_text(' \n', encoding='utf-8')
        result = self.run_control('start-core')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('配置不存在或为空', result.stdout)

    def test_empty_command_args_is_not_treated_as_valid_config(self):
        (self.module_directory / 'config/config.toml').write_text('instance_name = "test"\n', encoding='utf-8')
        (self.module_directory / 'config/command_args').write_text(' \n\t', encoding='utf-8')

        result = self.run_control('start-core')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('配置不存在或为空', result.stdout)

    def test_stale_control_lock_is_recovered(self):
        lock_directory = self.module_directory / 'run/lock'
        lock_directory.mkdir(parents=True)
        (lock_directory / 'pid').write_text('not-a-process-id\n', encoding='utf-8')

        result = self.run_control('start-core')

        self.assertNotIn('控制锁', result.stdout)
        self.assertFalse(lock_directory.exists())

    def test_concurrent_stale_lock_recovery_does_not_block_following_requests(self):
        lock_directory = self.module_directory / 'run/lock'
        lock_directory.mkdir(parents=True)
        (lock_directory / 'pid').write_text('not-a-process-id\n', encoding='utf-8')
        waiting_requests = [
            subprocess.Popen(
                ['sh', str(self.module_directory / 'control.sh'), 'start-core'],
                env=self.process_environment,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for _ in range(3)
        ]

        for waiting_request in waiting_requests:
            output, error = waiting_request.communicate(timeout=10)
            self.assertNotEqual(waiting_request.returncode, 0)
            self.assertNotIn('无法获取控制锁', output + error)
            self.assertIn('配置不存在或为空', output)
        self.assertFalse(lock_directory.exists())

    def test_active_control_lock_is_not_removed(self):
        lock_directory = self.module_directory / 'run/lock'
        lock_directory.mkdir(parents=True)
        (lock_directory / 'pid').write_text(f'{os.getpid()}\n', encoding='utf-8')

        result = self.run_control('start-core')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('无法获取控制锁', result.stdout)
        self.assertEqual((lock_directory / 'pid').read_text(encoding='utf-8'), f'{os.getpid()}\n')

    def test_reused_lock_pid_with_different_start_time_is_recovered(self):
        lock_directory = self.module_directory / 'run/lock'
        lock_directory.mkdir(parents=True)
        (lock_directory / 'pid').write_text(f'{os.getpid()}\n', encoding='utf-8')
        (lock_directory / 'start').write_text('stale-process-start-time\n', encoding='utf-8')

        result = self.run_control('start-core')

        self.assertNotIn('无法获取控制锁', result.stdout)
        self.assertIn('配置不存在或为空', result.stdout)
        self.assertFalse(lock_directory.exists())

    def test_boot_preference_commands_change_only_temporary_module(self):
        enabled = self.run_control('enable-boot')
        self.assertEqual(enabled.returncode, 0, enabled.stdout)
        self.assertTrue((self.module_directory / 'start_on_boot').exists())

        disabled = self.run_control('disable-boot')
        self.assertEqual(disabled.returncode, 0, disabled.stdout)
        self.assertFalse((self.module_directory / 'start_on_boot').exists())
        self.assertTrue((self.module_directory / 'disable_core').exists())

    def test_upgrade_cleanup_removes_only_legacy_web_files_and_preserves_boot_choice(self):
        active_module = self.module_directory
        staging_module = pathlib.Path(self.temporary_directory.name) / 'staging'
        staging_module.mkdir()
        web_config = active_module / 'config/web'
        web_config.mkdir()
        (active_module / 'config/config.toml').write_text('instance_name = "keep"\n', encoding='utf-8')
        (active_module / 'config/command_args').write_text('--network-name keep\n', encoding='utf-8')
        (active_module / 'config/web/et.db').write_text('legacy data', encoding='utf-8')
        (active_module / 'config/web_port').write_text('11211', encoding='utf-8')
        (active_module / 'web.log').write_text('legacy log', encoding='utf-8')
        (active_module / 'disable_web').touch()
        (active_module / 'run').mkdir()
        (active_module / 'run/easytier-web.pid').write_text('12345', encoding='utf-8')
        (active_module / 'easytier-web').touch()
        (active_module / 'easytier_web.sh').touch()

        environment = os.environ.copy()
        environment.update({
            'MODPATH': str(staging_module),
            'ACTIVE_MODDIR': str(active_module),
            'ARCH': 'arm64',
            'API': '35',
        })
        installer_functions = (
            'set_perm_recursive() { :; }; set_perm() { :; }; ui_print() { :; }; '
            '. "$1"'
        )
        subprocess.run(
            ['sh', '-c', installer_functions, 'customize-test', str(ROOT / 'module/customize.sh')],
            env=environment,
            text=True,
            capture_output=True,
            check=True,
        )

        self.assertFalse((active_module / 'config/web').exists())
        self.assertFalse((active_module / 'config/web_port').exists())
        self.assertFalse((active_module / 'web.log').exists())
        self.assertFalse((active_module / 'disable_web').exists())
        self.assertFalse((active_module / 'run/easytier-web.pid').exists())
        self.assertFalse((active_module / 'easytier-web').exists())
        self.assertFalse((active_module / 'easytier_web.sh').exists())
        self.assertEqual((active_module / 'config/config.toml').read_text(encoding='utf-8'), 'instance_name = "keep"\n')
        self.assertEqual((active_module / 'config/command_args').read_text(encoding='utf-8'), '--network-name keep\n')
        self.assertFalse((staging_module / 'start_on_boot').exists())

    def prepare_native_core(self):
        if platform.system() != 'Linux' or not pathlib.Path('/proc/self/stat').exists():
            self.skipTest('real /proc executable identity tests require Linux')
        compiler = shutil.which('cc')
        if compiler is None:
            self.skipTest('a C compiler is required for native process tests')
        core_binary = self.module_directory / 'easytier-core'
        subprocess.run(
            [compiler, '-std=c99', '-D_POSIX_C_SOURCE=200809L', '-O2',
             str(ROOT / 'scripts/fixtures/fake_core.c'), '-o', str(core_binary)],
            check=True,
            capture_output=True,
            text=True,
        )
        core_binary.chmod(0o755)
        shutil.copy2(ROOT / 'module/config/config.toml', self.module_directory / 'config/config.toml')
        stub_directory = pathlib.Path(self.temporary_directory.name) / 'process-test-commands'
        stub_directory.mkdir()
        getprop_stub = stub_directory / 'getprop'
        getprop_stub.write_text('#!/bin/sh\nprintf test\n', encoding='utf-8')
        getprop_stub.chmod(0o755)
        ip_stub = stub_directory / 'ip'
        ip_stub.write_text(
            '#!/bin/sh\nif [ "$1" = rule ] && [ "$2" = show ]; then '
            'printf "0: from all lookup main\\n"; fi\n',
            encoding='utf-8',
        )
        ip_stub.chmod(0o755)
        system_mkdir = shutil.which('mkdir')
        system_ln = shutil.which('ln')
        if system_mkdir is None or system_ln is None:
            self.skipTest('mkdir and ln are required for isolated core launch tests')
        mkdir_stub = stub_directory / 'mkdir'
        mkdir_stub.write_text(
            f'#!/bin/sh\nfor argument in "$@"; do '
            '[ "$argument" = /dev/net ] && exit 0; done\n'
            f'exec "{system_mkdir}" "$@"\n',
            encoding='utf-8',
        )
        mkdir_stub.chmod(0o755)
        link_stub = stub_directory / 'ln'
        link_stub.write_text(
            '#!/bin/sh\nlast_argument=\nfor argument in "$@"; do last_argument=$argument; done\n'
            '[ "$last_argument" = /dev/net/tun ] && exit 0\n'
            f'exec "{system_ln}" "$@"\n',
            encoding='utf-8',
        )
        link_stub.chmod(0o755)
        self.process_environment['PATH'] = f'{stub_directory}:{self.process_environment["PATH"]}'
        return core_binary

    def get_core_count(self):
        result = self.run_control('status')
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)['core_count']

    def wait_for_core_count(self, expected_count, timeout_seconds=3):
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if self.get_core_count() == expected_count:
                return
            time.sleep(0.05)
        self.assertEqual(self.get_core_count(), expected_count)

    def test_parallel_start_commands_create_only_one_native_core(self):
        self.prepare_native_core()
        first_start = subprocess.Popen(
            ['sh', str(self.module_directory / 'control.sh'), 'start-core'],
            env=self.process_environment,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        second_start = subprocess.Popen(
            ['sh', str(self.module_directory / 'control.sh'), 'start-core'],
            env=self.process_environment,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        try:
            first_stdout, first_stderr = first_start.communicate(timeout=15)
            second_stdout, second_stderr = second_start.communicate(timeout=15)
            self.assertEqual(first_start.returncode, 0, first_stderr or first_stdout)
            self.assertEqual(second_start.returncode, 0, second_stderr or second_stdout)
            self.assertEqual(self.get_core_count(), 1)
        finally:
            self.run_control('stop-core')

    def test_stop_core_terminates_all_native_instances(self):
        core_binary = self.prepare_native_core()
        first_core = subprocess.Popen([str(core_binary)])
        second_core = subprocess.Popen([str(core_binary)])
        try:
            self.wait_for_core_count(2)
            stopped = self.run_control('stop-core')
            self.assertEqual(stopped.returncode, 0, stopped.stdout)
            first_core.wait(timeout=3)
            second_core.wait(timeout=3)
            self.assertEqual(self.get_core_count(), 0)
        finally:
            for core_process in [first_core, second_core]:
                if core_process.poll() is None:
                    core_process.terminate()
                    core_process.wait(timeout=3)

    def test_registered_pid_status_avoids_full_process_discovery(self):
        self.prepare_native_core()
        started = self.run_control('start-core')
        self.assertEqual(started.returncode, 0, started.stdout)
        pgrep_path = shutil.which('pgrep')
        if pgrep_path is None:
            self.run_control('stop-core')
            self.skipTest('pgrep is required for this process-discovery assertion')
        probe_directory = pathlib.Path(self.temporary_directory.name) / 'probe-bin'
        probe_directory.mkdir()
        pgrep_marker = pathlib.Path(self.temporary_directory.name) / 'pgrep-called'
        pgrep_probe = probe_directory / 'pgrep'
        pgrep_probe.write_text(
            f'#!/bin/sh\nprintf called >> "{pgrep_marker}"\nexec "{pgrep_path}" "$@"\n',
            encoding='utf-8',
        )
        pgrep_probe.chmod(0o755)
        environment = os.environ.copy()
        environment['PATH'] = f'{probe_directory}:{environment["PATH"]}'
        try:
            status = subprocess.run(
                ['sh', str(self.module_directory / 'control.sh'), 'status'],
                env=environment, text=True, capture_output=True, check=True,
            )
            self.assertEqual(json.loads(status.stdout)['core_count'], 1)
            self.assertFalse(pgrep_marker.exists(), 'status should use the registered PID fast path')
        finally:
            self.run_control('stop-core')


if __name__ == '__main__':
    unittest.main()
