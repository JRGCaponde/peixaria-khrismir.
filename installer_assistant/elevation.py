"""Utilitário partilhado: arranca um comando e, se o Windows recusar por
falta de privilégios (WinError 740 — "A operação pedida necessita de
elevação"), repete via PowerShell `Start-Process -Verb RunAs`, que mostra
o prompt de UAC nativo para o utilizador aprovar.

Só a instalação em si corre elevada — a aplicação principal continua a
correr com privilégios normais, e o utilizador só vê o UAC quando é
mesmo necessário (não sabemos à partida quais instaladores precisam de
admin).

Usado por `installer_core.py` (instalador local do utilizador) e
`winget_manager.py` (`winget install` de dependências) — ambos podem
esbarrar no mesmo problema consoante o sistema.
"""

import subprocess
from typing import Callable

LogCallback = Callable[[str], None]


def launch(command: list[str], log_callback: LogCallback) -> subprocess.Popen:
    """Arranca `command`. Se o SO recusar por falta de privilégios,
    relança pedindo elevação via UAC. Outros erros de arranque (ficheiro
    corrompido, permissões de ficheiro, etc.) propagam-se normalmente."""
    try:
        return subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
    except OSError as error:
        if getattr(error, "winerror", None) != 740:
            raise
        log_callback("Privilégios de administrador necessários — a pedir elevação (UAC)...")
        return _launch_elevated(command)


def _launch_elevated(command: list[str]) -> subprocess.Popen:
    # Start-Process -Verb RunAs abre o processo elevado numa janela à
    # parte (sem herdar stdin/stdout do processo pai) — por isso não há
    # streaming de logs em tempo real neste caminho, só o código de saída
    # no fim. Aceitável: instaladores gráficos raramente escrevem na
    # consola de qualquer forma.
    exe, *args = command
    ps_args = ",".join(f"'{_escape(arg)}'" for arg in args)
    arg_list_clause = f" -ArgumentList {ps_args}" if args else ""
    ps_command = (
        f"$p = Start-Process -FilePath '{_escape(exe)}'{arg_list_clause} "
        "-Verb RunAs -Wait -PassThru; exit $p.ExitCode"
    )
    return subprocess.Popen(
        ["powershell", "-NoProfile", "-Command", ps_command],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )


def _escape(value: str) -> str:
    return value.replace("'", "''")
