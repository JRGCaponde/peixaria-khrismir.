"""Módulo de Internet — integração com o winget (Módulo 4).

Antes de correr o instalador local, este módulo usa o `winget` nativo do
Windows (App Installer) para:

  1. Confirmar que o `winget` está disponível no sistema;
  2. Verificar, de forma informativa, se existe um pacote de nome
     semelhante no repositório winget — best-effort, porque não há forma
     fiável de identificar univocamente um instalador arbitrário só pelo
     nome do ficheiro;
  3. Garantir que dependências comuns (Visual C++ Redistributable e .NET
     Desktop Runtime) estão instaladas, instalando-as automaticamente se
     faltarem.

Não depende da GUI — só de `log_callback` para reportar progresso. Nunca
bloqueia a instalação principal: se o winget não existir ou uma consulta
falhar, regista um aviso e o fluxo principal (`installer_core.py`)
continua com o ficheiro local do utilizador.
"""

import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable

LogCallback = Callable[[str], None]

# IDs oficiais no repositório winget (confirmáveis com `winget show --id <id>`).
REQUIRED_DEPENDENCIES = [
    ("Microsoft.VCRedist.2015+.x64", "Visual C++ Redistributable (x64)"),
    ("Microsoft.DotNet.DesktopRuntime.8", ".NET Desktop Runtime 8"),
]

_COMMON_FLAGS = ["--accept-source-agreements", "--disable-interactivity"]
_QUERY_TIMEOUT_SECONDS = 30


def is_winget_available() -> bool:
    return shutil.which("winget") is not None


def prepare_environment(file_path: str, log_callback: LogCallback) -> None:
    """Corre as verificações/preparações via winget antes da instalação."""
    if not is_winget_available():
        log_callback("winget não encontrado no sistema — a saltar verificações online.")
        return

    _check_repository(file_path, log_callback)
    _ensure_dependencies(log_callback)


# ----------------------------------------------------------------------
# Pesquisa no repositório (informativo)
# ----------------------------------------------------------------------
def _check_repository(file_path: str, log_callback: LogCallback) -> None:
    term = _guess_package_name(file_path)
    if not term:
        return

    log_callback(f"A procurar '{term}' no repositório winget...")

    try:
        result = subprocess.run(
            ["winget", "search", term, *_COMMON_FLAGS],
            capture_output=True,
            text=True,
            timeout=_QUERY_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        log_callback(f"Não foi possível consultar o winget: {error}")
        return

    output = result.stdout.strip()
    if result.returncode != 0 or not output or "No package found" in output:
        log_callback("Nenhum pacote correspondente encontrado no winget — a prosseguir com o ficheiro local.")
        return

    lines = [line for line in output.splitlines() if line.strip()][:5]
    log_callback("Pacote(s) semelhante(s) encontrado(s) no winget:")
    for line in lines:
        log_callback(f"  {line}")
    log_callback(
        "Nota: pode existir uma versão mais recente no winget — considere "
        "'winget upgrade' depois desta instalação, se preferir a versão online."
    )


def _guess_package_name(file_path: str) -> str:
    """Deriva um termo de pesquisa a partir do nome do ficheiro (heurística,
    sem garantias — ex.: 'MeuApp-Setup-2.3.1.exe' -> 'MeuApp'). Se o nome
    ficar vazio depois de limpo, devolve string vazia e a pesquisa é
    saltada em vez de arriscar um resultado sem sentido."""
    stem = Path(file_path).stem
    stem = re.sub(r"[-_]+", " ", stem)
    stem = re.sub(r"\bv?\d+(\.\d+)+\b", "", stem, flags=re.IGNORECASE)
    stem = re.sub(
        r"\b(setup|installer|instalador|install|x64|x86|win64|win32|online|offline)\b",
        "",
        stem,
        flags=re.IGNORECASE,
    )
    return " ".join(stem.split())


# ----------------------------------------------------------------------
# Dependências comuns (.NET / Visual C++)
# ----------------------------------------------------------------------
def _ensure_dependencies(log_callback: LogCallback) -> None:
    log_callback("A verificar dependências comuns do sistema (.NET / Visual C++)...")
    for package_id, friendly_name in REQUIRED_DEPENDENCIES:
        if _is_installed(package_id):
            log_callback(f"'{friendly_name}' já está instalado.")
            continue

        log_callback(f"'{friendly_name}' não encontrado — a instalar via winget...")
        if _install(package_id, log_callback):
            log_callback(f"'{friendly_name}' instalado com sucesso.")
        else:
            log_callback(
                f"Não foi possível instalar '{friendly_name}' automaticamente "
                "— a instalação principal prossegue na mesma."
            )


def _is_installed(package_id: str) -> bool:
    try:
        result = subprocess.run(
            ["winget", "list", "--id", package_id, "-e", *_COMMON_FLAGS],
            capture_output=True,
            text=True,
            timeout=_QUERY_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False

    return result.returncode == 0 and package_id in result.stdout


def _install(package_id: str, log_callback: LogCallback) -> bool:
    command = [
        "winget", "install", "--id", package_id, "-e",
        "--silent", "--accept-package-agreements", *_COMMON_FLAGS,
    ]
    try:
        process = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
    except OSError as error:
        log_callback(f"Erro ao iniciar o winget: {error}")
        return False

    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line:
            log_callback(f"  {line}")

    return process.wait() == 0
