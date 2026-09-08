import os
import signal
import subprocess
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings


@pytest.mark.parametrize("stop", ["failure", "interrupt"])
def test_launcher_cleans_up_without_deleting_volumes(tmp_path, stop):
    backend = tmp_path / "apps/backend"
    backend.mkdir(parents=True)
    (backend / ".env.example").write_text("EXAMPLE=1\n")
    launcher = tmp_path / "run-backend.sh"
    launcher.write_bytes((Path(__file__).resolve().parents[3] / "run-backend.sh").read_bytes())
    binary = tmp_path / "docker"
    binary.write_text(
        "#!/usr/bin/env python3\n"
        "import os, sys, time\n"
        'with open(os.environ["CALLS"], "a") as f: f.write(" ".join(sys.argv[1:]) + "\\n")\n'
        'if "build" in sys.argv:\n'
        '    if os.environ["STOP"] == "failure": sys.exit(42)\n'
        "    time.sleep(60)\n"
    )
    binary.chmod(0o755)
    calls = tmp_path / "calls"
    env = dict(os.environ, PATH=f"{tmp_path}:{os.environ['PATH']}", CALLS=str(calls), STOP=stop)
    proc = subprocess.Popen(
        ["bash", str(launcher)], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        if stop == "interrupt":
            deadline = time.monotonic() + 5
            while not calls.exists() or "build" not in calls.read_text():
                assert time.monotonic() < deadline
                time.sleep(0.02)
            proc.send_signal(signal.SIGINT)
        proc.communicate(timeout=10)
        assert proc.returncode == (42 if stop == "failure" else 130)
        log = calls.read_text()
        assert "down --timeout 15" in log
        assert "--volumes" not in log and " -v" not in log
        assert (backend / ".env").read_text() == "EXAMPLE=1\n"
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def test_prepare_local_refuses_nonlocal_settings():
    with pytest.raises(CommandError, match="only for local"):
        call_command("prepare_local")


@override_settings(SETTINGS_MODULE="config.settings.local")
def test_prepare_local_timeout_never_runs_migrations():
    module = "marketplace.operations.management.commands.prepare_local"
    with (
        patch(f"{module}.connection") as connection,
        patch(f"{module}.time.monotonic", side_effect=[0, 601]),
        patch(f"{module}.call_command") as command,
    ):
        connection.ensure_connection.side_effect = OSError("unavailable")
        with pytest.raises(CommandError, match="10 minutes"):
            call_command("prepare_local")
        command.assert_not_called()


@override_settings(SETTINGS_MODULE="config.settings.local")
def test_prepare_local_initializes_storage_before_migrating():
    module = "marketplace.operations.management.commands.prepare_local"
    with (
        patch(f"{module}.connection"),
        patch(f"{module}.Redis"),
        patch(f"{module}.smtplib.SMTP"),
        patch(f"{module}.socket.create_connection") as scanner,
        patch(f"{module}.call_command") as command,
    ):
        scanner.return_value.__enter__.return_value.recv.return_value = b"PONG\0"
        call_command("prepare_local")
        assert [call.args[0] for call in command.call_args_list] == [
            "init_local_storage",
            "migrate",
        ]
