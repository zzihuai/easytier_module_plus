#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static volatile sig_atomic_t is_stopping = 0;

static void request_stop(int signal_number) {
    (void)signal_number;
    is_stopping = 1;
}

int main(int argument_count, char **arguments) {
    struct sigaction stop_action = {0};
    stop_action.sa_handler = request_stop;
    sigemptyset(&stop_action.sa_mask);
    sigaction(SIGTERM, &stop_action, NULL);
    sigaction(SIGINT, &stop_action, NULL);

    if (argument_count > 1 && strcmp(arguments[1], "--version") == 0) {
        puts("fake-easytier-core test");
        return 0;
    }

    while (!is_stopping) pause();
    return 0;
}
