"""Lógica de instalação (Módulo 2+).

Este módulo fica isolado da interface gráfica de propósito: a GUI apenas
chama `install()` e recebe mensagens de progresso através de `log_callback`.
Nos próximos módulos, esta função passa a invocar o instalador
selecionado (ex.: `subprocess.run` com os argumentos silenciosos do
.exe/.msi) e a reportar sucesso/erro real.
"""

from pathlib import Path
from typing import Callable

LogCallback = Callable[[str], None]


def install(file_path: str, log_callback: LogCallback) -> bool:
    """Executa a instalação do ficheiro indicado.

    Por agora é apenas um placeholder — será implementado num módulo
    seguinte (ex.: chamada a `subprocess` com flags silenciosas para
    .exe/.msi, deteção de progresso, etc.).
    """
    log_callback(f"Instalação de '{Path(file_path).name}' ainda não implementada.")
    return False
