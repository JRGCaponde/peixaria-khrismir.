"""Lógica de instalação (Módulo 4).

Fluxo completo por instalação:
  1. `winget_manager.prepare_environment` — verifica o repositório winget e
     garante dependências comuns (.NET / Visual C++) antes de arrancar.
  2. Corre o instalador local do utilizador com flags silenciosas.
  3. Para .exe: se a instalação silenciosa não for confirmada dentro de um
     tempo razoável (as flags podem não ser reconhecidas por aquele
     instalador em concreto), ativa `visual_fallback` para concluir o
     assistente gráfico automaticamente.

Este módulo não depende da GUI — só de `log_callback` para reportar
progresso. Corre de forma bloqueante até à conclusão, por isso deve ser
chamado a partir de uma thread separada da interface gráfica (é isso que
`gui.py` faz).
"""

import subprocess
import time
from pathlib import Path
from typing import Callable

import elevation
import visual_fallback
import winget_manager

LogCallback = Callable[[str], None]

# Códigos de saída do msiexec que não representam falha.
# 0 = sucesso · 3010 = sucesso, mas requer reinício do computador.
MSI_SUCCESS_CODES = {0, 3010}

# Tempo que se dá a um .exe para terminar sozinho em modo silencioso antes
# de assumirmos que as flags foram ignoradas e ativarmos a automação
# visual. Instaladores legítimos costumam ser mais rápidos do que isto;
# um wizard gráfico à espera de clique fica parado indefinidamente.
SILENT_ATTEMPT_TIMEOUT_SECONDS = 20


def install(file_path: str, log_callback: LogCallback) -> bool:
    """Instala o ficheiro indicado. Devolve True em caso de sucesso."""
    path = Path(file_path)

    if not path.exists():
        log_callback(f"Ficheiro não encontrado: '{path}'.")
        return False

    winget_manager.prepare_environment(str(path), log_callback)

    extension = path.suffix.lower()
    if extension == ".msi":
        return _install_msi(path, log_callback)
    elif extension == ".exe":
        return _install_exe(path, log_callback)

    log_callback(f"Tipo de ficheiro não suportado: '{extension}'.")
    return False


# ----------------------------------------------------------------------
# .msi — o /qn é um standard do Windows: nunca mostra interface, por isso
# não há necessidade de fallback visual aqui.
# ----------------------------------------------------------------------
def _install_msi(path: Path, log_callback: LogCallback) -> bool:
    command = ["msiexec", "/i", str(path), "/qn", "/norestart"]
    log_callback(f"A executar: {' '.join(command)}")

    try:
        process = elevation.launch(command, log_callback)
    except OSError as error:
        log_callback(f"Erro ao iniciar o instalador: {error}")
        return False

    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line:
            log_callback(line)

    returncode = process.wait()
    if returncode in MSI_SUCCESS_CODES:
        log_callback("Instalação concluída com sucesso.")
        if returncode == 3010:
            log_callback("É necessário reiniciar o computador para concluir a instalação.")
        return True

    log_callback(f"Instalação falhou (código de saída {returncode}).")
    return False


# ----------------------------------------------------------------------
# .exe — não há norma única de flags silenciosas (Inno Setup, NSIS,
# InstallShield, ... usam flags diferentes). Tentamos as do Inno Setup;
# se o instalador as ignorar e abrir um wizard gráfico, a automação
# visual assume o controlo.
# ----------------------------------------------------------------------
def _install_exe(path: Path, log_callback: LogCallback) -> bool:
    command = [str(path), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]
    log_callback(f"A executar: {' '.join(command)}")

    try:
        process = elevation.launch(command, log_callback)
    except OSError as error:
        log_callback(f"Erro ao iniciar o instalador: {error}")
        return False

    if not _wait_briefly(process, SILENT_ATTEMPT_TIMEOUT_SECONDS):
        log_callback(
            f"Sem confirmação de instalação silenciosa em {SILENT_ATTEMPT_TIMEOUT_SECONDS}s "
            "— o instalador pode ter aberto uma interface gráfica."
        )

        if not visual_fallback.is_available():
            log_callback(
                "Automação visual indisponível (pyautogui/pytesseract não instalados) "
                "— a aguardar conclusão manual do instalador."
            )
            process.wait()
        elif not visual_fallback.run_visual_fallback(process, log_callback):
            _drain_output(process, log_callback)
            return False

    _drain_output(process, log_callback)
    return _check_result(process.returncode, log_callback)


def _wait_briefly(process: subprocess.Popen, timeout: float) -> bool:
    """Espera até `timeout` segundos que o processo termine sozinho, sem
    ler stdout — instaladores gráficos normalmente não escrevem nada na
    consola, e `readline()` bloquearia indefinidamente à espera de uma
    linha que nunca chega, quebrando o temporizador."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return True
        time.sleep(0.5)
    return process.poll() is not None


def _drain_output(process: subprocess.Popen, log_callback: LogCallback) -> None:
    process.wait()
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line:
            log_callback(line)


def _check_result(returncode: int, log_callback: LogCallback) -> bool:
    if returncode == 0:
        log_callback("Instalação concluída com sucesso.")
        return True
    log_callback(f"Instalação falhou (código de saída {returncode}).")
    return False
