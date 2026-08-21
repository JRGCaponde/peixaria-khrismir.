"""Lógica de instalação (Módulo 2).

Executa o instalador selecionado através de `subprocess`, usando flags
silenciosas quando possível, e reporta o progresso através de
`log_callback`. Este módulo não depende da GUI — pode ser chamado ou
testado isoladamente. Como corre de forma bloqueante até o instalador
terminar, deve ser invocado a partir de uma thread separada da interface
gráfica (é isso que `gui.py` faz).
"""

import subprocess
from pathlib import Path
from typing import Callable

LogCallback = Callable[[str], None]

# Códigos de saída do msiexec que não representam falha.
# 0 = sucesso · 3010 = sucesso, mas requer reinício do computador.
MSI_SUCCESS_CODES = {0, 3010}


def install(file_path: str, log_callback: LogCallback) -> bool:
    """Instala o ficheiro indicado de forma silenciosa.

    Devolve True em caso de sucesso, False caso contrário.
    """
    path = Path(file_path)

    if not path.exists():
        log_callback(f"Ficheiro não encontrado: '{path}'.")
        return False

    extension = path.suffix.lower()

    if extension == ".msi":
        return _install_msi(path, log_callback)
    elif extension == ".exe":
        return _install_exe(path, log_callback)

    log_callback(f"Tipo de ficheiro não suportado: '{extension}'.")
    return False


def _install_msi(path: Path, log_callback: LogCallback) -> bool:
    # O msiexec é standard do Windows: /qn = sem interface, /norestart =
    # não reiniciar automaticamente o computador no final.
    command = ["msiexec", "/i", str(path), "/qn", "/norestart"]
    return _run_installer(command, log_callback, success_codes=MSI_SUCCESS_CODES)


def _install_exe(path: Path, log_callback: LogCallback) -> bool:
    # Ao contrário do .msi, não existe uma norma única de instalação
    # silenciosa para .exe — cada ferramenta de empacotamento (Inno Setup,
    # NSIS, InstallShield, ...) define as suas próprias flags. Usamos aqui
    # as do Inno Setup (uma das mais comuns); se o instalador não as
    # reconhecer, tende a ignorá-las e pode abrir a sua própria interface
    # em vez de falhar.
    command = [str(path), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]
    return _run_installer(command, log_callback, success_codes={0})


def _run_installer(
    command: list[str],
    log_callback: LogCallback,
    success_codes: set[int],
) -> bool:
    log_callback(f"A executar: {' '.join(command)}")

    try:
        result = subprocess.run(command, capture_output=True, text=True)
    except OSError as error:
        log_callback(f"Erro ao iniciar o instalador: {error}")
        return False

    if result.returncode in success_codes:
        log_callback("Instalação concluída com sucesso.")
        if result.returncode == 3010:
            log_callback("É necessário reiniciar o computador para concluir a instalação.")
        return True

    log_callback(f"Instalação falhou (código de saída {result.returncode}).")
    if result.stderr.strip():
        log_callback(result.stderr.strip())
    return False
