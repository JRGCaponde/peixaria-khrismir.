"""Interface gráfica do Assistente de Instalação Automatizada (Módulo 1).

Responsável apenas pela janela e interação com o utilizador. A lógica de
instalação propriamente dita vive em `installer_core.py` e é chamada a
partir daqui, mantendo os dois módulos desacoplados.
"""

import threading
from datetime import datetime
from pathlib import Path
from tkinter import filedialog

import customtkinter as ctk

import installer_core

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

FILE_TYPES = [
    ("Instaladores", "*.exe *.msi"),
    ("Executável (.exe)", "*.exe"),
    ("Pacote Windows Installer (.msi)", "*.msi"),
    ("Todos os ficheiros", "*.*"),
]


class InstallerAssistantApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Assistente de Instalação Automatizada")
        self.geometry("640x480")
        self.minsize(560, 400)

        self.selected_file_path: str | None = None

        self._build_layout()
        self.log("Pronto. Selecione um ficheiro de instalação (.exe ou .msi) para começar.")

    # ------------------------------------------------------------------
    # Construção da interface
    # ------------------------------------------------------------------
    def _build_layout(self) -> None:
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(3, weight=1)

        header = ctk.CTkLabel(
            self,
            text="Assistente de Instalação",
            font=ctk.CTkFont(size=20, weight="bold"),
        )
        header.grid(row=0, column=0, padx=20, pady=(20, 10), sticky="w")

        file_frame = ctk.CTkFrame(self)
        file_frame.grid(row=1, column=0, padx=20, pady=10, sticky="ew")
        file_frame.grid_columnconfigure(0, weight=1)

        self.file_path_label = ctk.CTkLabel(
            file_frame,
            text="Nenhum ficheiro selecionado",
            anchor="w",
            text_color=("gray20", "gray70"),
        )
        self.file_path_label.grid(row=0, column=0, padx=(15, 10), pady=15, sticky="ew")

        self.select_button = ctk.CTkButton(
            file_frame,
            text="Selecionar Ficheiro",
            command=self.select_file,
        )
        self.select_button.grid(row=0, column=1, padx=(0, 15), pady=15)

        self.install_button = ctk.CTkButton(
            self,
            text="Iniciar Instalação",
            command=self.start_installation,
            state="disabled",
        )
        self.install_button.grid(row=2, column=0, padx=20, pady=(0, 10), sticky="e")

        log_label = ctk.CTkLabel(self, text="Estado / Logs", anchor="w")
        log_label.grid(row=3, column=0, padx=20, pady=(0, 0), sticky="nw")

        self.log_textbox = ctk.CTkTextbox(self, state="disabled", wrap="word")
        self.log_textbox.grid(row=4, column=0, padx=20, pady=(5, 20), sticky="nsew")
        self.grid_rowconfigure(4, weight=1)

    # ------------------------------------------------------------------
    # Ações
    # ------------------------------------------------------------------
    def select_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Selecionar ficheiro de instalação",
            filetypes=FILE_TYPES,
        )
        if not path:
            return

        self.selected_file_path = path
        self.file_path_label.configure(text=Path(path).name)
        self.install_button.configure(state="normal")
        self.log(f"Ficheiro selecionado: {path}")

    def start_installation(self) -> None:
        if not self.selected_file_path:
            self.log("Nenhum ficheiro selecionado.")
            return

        self.select_button.configure(state="disabled")
        self.install_button.configure(state="disabled")
        self.log("A iniciar instalação...")

        thread = threading.Thread(
            target=self._run_installation,
            args=(self.selected_file_path,),
            daemon=True,
        )
        thread.start()

    def _run_installation(self, file_path: str) -> None:
        # Corre em segundo plano: o subprocess do instalador pode demorar,
        # e bloquear a thread principal congelaria a janela. As atualizações
        # à interface são sempre despachadas para a thread principal via
        # `self.after`, porque widgets do Tkinter não são thread-safe.
        success = installer_core.install(file_path, self._thread_safe_log)
        self.after(0, self._on_installation_finished, success)

    def _thread_safe_log(self, message: str) -> None:
        self.after(0, self.log, message)

    def _on_installation_finished(self, success: bool) -> None:
        self.select_button.configure(state="normal")
        self.install_button.configure(state="normal")
        if not success:
            self.log("Instalação terminou com erros — verifique o log acima.")

    # ------------------------------------------------------------------
    # Utilitários
    # ------------------------------------------------------------------
    def log(self, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_textbox.configure(state="normal")
        self.log_textbox.insert("end", f"[{timestamp}] {message}\n")
        self.log_textbox.configure(state="disabled")
        self.log_textbox.see("end")
