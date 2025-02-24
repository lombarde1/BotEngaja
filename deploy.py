#!/usr/bin/env python3
import os
import re
import subprocess
import time
import paramiko
import requests
from typing import Dict, List, Optional
import sys

class AutoDeploy:
    def __init__(self,
                 github_username: str,
                 github_token: str,
                 vps_host: str,
                 vps_username: str,
                 vps_password: str = None,
                 vps_key_filename: str = None,
                 base_port: int = 7000,
                 domain: str = "operacao2k25.shop"):
        # Configurações GitHub
        self.github_username = github_username
        self.github_token = github_token
        
        # Configurações VPS
        self.vps_host = vps_host
        self.vps_username = vps_username
        self.vps_password = vps_password
        self.vps_key_filename = vps_key_filename
        self.base_port = base_port
        self.domain = domain
        
        # Conexão SSH
        self.ssh = None
        
        # Informações do projeto
        self.project_path = os.getcwd()
        self.project_name = os.path.basename(self.project_path)
        
        # Status do deploy
        self.github_url = None
        self.deployed_port = None
        self.deployed_domain = None

    def create_github_repo(self) -> bool:
        """Cria um novo repositório no GitHub ou verifica se já existe"""
        print(f"🔍 Verificando se o repositório {self.project_name} já existe no GitHub...")
        
        try:
            # Verifica se o repositório já existe
            headers = {
                'Authorization': f'Bearer {self.github_token}',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
            
            response = requests.get(
                f'https://api.github.com/repos/{self.github_username}/{self.project_name}',
                headers=headers
            )
            
            if response.status_code == 200:
                print(f"✅ O repositório {self.project_name} já existe no GitHub!")
                self.github_url = f"https://github.com/{self.github_username}/{self.project_name}"
                return True
                
            # Se não existir, cria um novo
            print(f"🆕 Criando novo repositório {self.project_name}...")
            
            data = {
                'name': self.project_name,
                'private': True,
                'auto_init': False  # Não inicializa com README para evitar conflitos
            }
            
            response = requests.post(
                'https://api.github.com/user/repos',
                headers=headers,
                json=data
            )
            
            if response.status_code in [201, 200]:
                print(f"✅ Repositório {self.project_name} criado com sucesso!")
                self.github_url = f"https://github.com/{self.github_username}/{self.project_name}"
                time.sleep(3)  # Aguarda a criação do repositório
                return True
            else:
                print(f"❌ Falha ao criar repositório: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Erro ao criar/verificar repositório: {e}")
            return False

    def push_to_github(self) -> bool:
        """Inicializa Git, adiciona arquivos e envia para o GitHub"""
        print(f"📤 Enviando projeto para o GitHub...")
        
        try:
            # Verifica se o diretório já é um repositório Git
            is_git_repo = os.path.exists(os.path.join(self.project_path, '.git'))
            
            # Comandos para configurar o Git
            git_commands = []
            
            if not is_git_repo:
                git_commands = [
                    ["git", "init"],
                    ["git", "config", "user.name", self.github_username],
                    ["git", "config", "user.email", f"{self.github_username}@users.noreply.github.com"],
                    ["git", "remote", "add", "origin", f"https://{self.github_username}:{self.github_token}@github.com/{self.github_username}/{self.project_name}.git"]
                ]
            else:
                # Verifica se o remote já está configurado
                try:
                    remote_url = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], text=True).strip()
                    if not remote_url:
                        git_commands.append(["git", "remote", "add", "origin", f"https://{self.github_username}:{self.github_token}@github.com/{self.github_username}/{self.project_name}.git"])
                except subprocess.CalledProcessError:
                    git_commands.append(["git", "remote", "add", "origin", f"https://{self.github_username}:{self.github_token}@github.com/{self.github_username}/{self.project_name}.git"])
            
            # Executa comandos de inicialização git, se necessário
            for cmd in git_commands:
                try:
                    subprocess.run(cmd, check=True, cwd=self.project_path)
                except subprocess.CalledProcessError as e:
                    print(f"⚠️ Aviso ao executar {cmd[0]}: {e}")
            
            # Adiciona, faz commit e envia
            commit_time = time.strftime("%Y-%m-%d %H:%M:%S")
            
            # Primeiro adiciona e faz commit
            add_commit_commands = [
                ["git", "add", "."],
                ["git", "commit", "-m", f"Auto deploy at {commit_time}"]
            ]
            
            for cmd in add_commit_commands:
                try:
                    result = subprocess.run(cmd, check=True, cwd=self.project_path, capture_output=True, text=True)
                    print(f"🔄 {cmd[0]} {cmd[1]}: {result.stdout}")
                except subprocess.CalledProcessError as e:
                    print(f"⚠️ Aviso ao executar {cmd[0]} {cmd[1]}: {e}")
                    # Se o commit falhar por não ter alterações, continua
                    if "nothing to commit" in str(e.stdout) or "no changes added" in str(e.stdout):
                        print("✅ Sem alterações para commit, continuando...")
                        continue
                    # Se for outro tipo de erro no commit, continua mesmo assim
                    print("⚠️ Continuando mesmo com erro de commit...")
            
            # Verifica qual branch existe localmente
            try:
                current_branch = subprocess.check_output(
                    ["git", "branch", "--show-current"], 
                    cwd=self.project_path, 
                    text=True
                ).strip()
                
                print(f"🔍 Branch atual: {current_branch or 'nenhuma'}")
                
                # Se não temos branch, criamos uma
                if not current_branch:
                    print("🔄 Criando branch local 'main'...")
                    subprocess.run(
                        ["git", "checkout", "-b", "main"], 
                        cwd=self.project_path, 
                        stderr=subprocess.PIPE
                    )
                    current_branch = "main"
            except Exception as e:
                print(f"⚠️ Erro ao verificar branch: {e}")
                # Se não conseguimos determinar, assumimos main
                current_branch = "main"
                print("🔄 Criando branch local 'main'...")
                try:
                    subprocess.run(
                        ["git", "checkout", "-b", "main"], 
                        cwd=self.project_path, 
                        stderr=subprocess.PIPE
                    )
                except:
                    pass
            
            # Agora tentamos o push
            push_attempts = [
                ["git", "push", "-u", "origin", current_branch, "--force"],
                ["git", "push", "-u", "origin", "main", "--force"],
                ["git", "push", "-u", "origin", "master", "--force"]
            ]
            
            for push_cmd in push_attempts:
                try:
                    print(f"🔄 Tentando: {' '.join(push_cmd)}")
                    result = subprocess.run(
                        push_cmd, 
                        cwd=self.project_path, 
                        capture_output=True, 
                        text=True
                    )
                    print(f"✅ Push realizado com sucesso: {result.stdout}")
                    return True
                except Exception as e:
                    print(f"⚠️ Tentativa de push falhou: {e}")
                    continue
            
            # Se chegamos aqui, todas as tentativas falharam
            print("⚠️ Não foi possível fazer push para o GitHub, mas continuaremos com o deploy local")
            return True  # Continuamos mesmo assim para tentar o deploy local
            
            print(f"✅ Projeto enviado com sucesso para o GitHub: {self.github_url}")
            return True
            
        except Exception as e:
            print(f"❌ Erro ao enviar para o GitHub: {e}")
            return False

    def connect_to_vps(self) -> bool:
        """Estabelece conexão SSH com a VPS"""
        try:
            print(f"🔌 Conectando à VPS {self.vps_host}...")
            self.ssh = paramiko.SSHClient()
            self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if self.vps_key_filename:
                self.ssh.connect(
                    self.vps_host,
                    username=self.vps_username,
                    key_filename=self.vps_key_filename
                )
            else:
                self.ssh.connect(
                    self.vps_host,
                    username=self.vps_username,
                    password=self.vps_password
                )
            print("✅ Conectado à VPS com sucesso!")
            return True
        except Exception as e:
            print(f"❌ Falha ao conectar à VPS: {e}")
            return False

    def run_vps_command(self, command: str, print_output: bool = True) -> bool:
        """Executa um comando na VPS e retorna se foi bem sucedido"""
        try:
            if print_output:
                print(f"🔄 Executando comando na VPS...")
            
            stdin, stdout, stderr = self.ssh.exec_command(command, get_pty=True)
            
            # Lê a saída em tempo real
            while True:
                line = stdout.readline()
                if not line:
                    break
                if print_output:
                    print(line.strip())
            
            exit_status = stdout.channel.recv_exit_status()
            
            # Lê qualquer erro que possa ter ocorrido
            err = stderr.read().decode()
            if err and print_output:
                print("Erro:", err)
            
            return exit_status == 0
            
        except Exception as e:
            print(f"❌ Falha ao executar comando: {e}")
            return False

    def check_vps_directory(self, path: str) -> bool:
        """Verifica se um diretório existe na VPS"""
        return self.run_vps_command(f"test -d {path}", print_output=False)

    def find_available_port(self) -> int:
        """Encontra uma porta disponível na VPS a partir da base_port"""
        try:
            print("🔍 Procurando uma porta disponível na VPS...")
            
            # Verifica quais portas já estão em uso com o comando netstat
            stdin, stdout, stderr = self.ssh.exec_command("netstat -tuln | grep LISTEN")
            output = stdout.read().decode()
            
            # Extrai todas as portas em uso
            used_ports = set()
            for line in output.split('\n'):
                if ':' in line:
                    parts = line.split(':')
                    for part in parts:
                        try:
                            port = int(''.join(filter(str.isdigit, part.split(' ')[0])))
                            if port > 1024:  # Consideramos apenas portas não privilegiadas
                                used_ports.add(port)
                        except ValueError:
                            pass
            
            # Encontra a primeira porta disponível
            port = self.base_port
            while port in used_ports:
                port += 1
                if port > 65000:
                    print("⚠️ Não foi possível encontrar uma porta disponível!")
                    return self.base_port  # Retorna a porta base como fallback
            
            print(f"✅ Porta disponível encontrada: {port}")
            return port
            
        except Exception as e:
            print(f"⚠️ Erro ao procurar porta disponível: {e}")
            return self.base_port + 1  # Retorna base_port + 1 como fallback

    def is_node_project(self) -> bool:
        """Verifica se o projeto atual é um projeto Node.js"""
        # Verifica package.json na raiz
        if os.path.exists(os.path.join(self.project_path, 'package.json')):
            return True
            
        # Verifica se existe uma pasta src com arquivos js
        src_path = os.path.join(self.project_path, 'src')
        if os.path.exists(src_path) and os.path.isdir(src_path):
            for file in os.listdir(src_path):
                if file.endswith('.js'):
                    return True
                    
        return False

    def find_main_entry_file(self) -> Optional[tuple]:
        """
        Encontra o arquivo principal de entrada do projeto.
        Retorna uma tupla (caminho_relativo, caminho_absoluto) ou None se não encontrar.
        """
        # Lista de possíveis arquivos de entrada para Node.js
        node_entry_files = [
            'app.js', 'server.js', 'index.js', 'main.js', 'src/app.js', 
            'src/server.js', 'src/index.js', 'src/main.js'
        ]
        
        # Lista de possíveis arquivos de entrada para Python
        python_entry_files = [
            'app.py', 'main.py', 'src/app.py', 'src/main.py'
        ]
        
        # Primeiro procura em node_entry_files se for um projeto Node.js
        if self.is_node_project():
            for entry_file in node_entry_files:
                abs_path = os.path.join(self.project_path, entry_file)
                if os.path.exists(abs_path):
                    return (entry_file, abs_path)
                    
            # Procura por um script "start" no package.json
            package_path = os.path.join(self.project_path, 'package.json')
            if os.path.exists(package_path):
                try:
                    import json
                    with open(package_path, 'r') as f:
                        package_data = json.load(f)
                    
                    if 'scripts' in package_data and 'start' in package_data['scripts']:
                        start_script = package_data['scripts']['start']
                        # Extrai o nome do arquivo do comando start
                        # Ex: "node src/app.js" -> "src/app.js"
                        if 'node' in start_script:
                            parts = start_script.split('node')
                            if len(parts) > 1:
                                file_path = parts[1].strip()
                                abs_path = os.path.join(self.project_path, file_path)
                                if os.path.exists(abs_path):
                                    return (file_path, abs_path)
                except Exception as e:
                    print(f"⚠️ Erro ao ler package.json: {e}")
        
        # Procura em python_entry_files se for um projeto Python
        elif self.is_python_project():
            for entry_file in python_entry_files:
                abs_path = os.path.join(self.project_path, entry_file)
                if os.path.exists(abs_path):
                    return (entry_file, abs_path)
        
        # Se ainda não encontrou, procura recursivamente por arquivos que pareçam ser o ponto de entrada
        for root, _, files in os.walk(self.project_path):
            for file in files:
                # Pula node_modules e arquivos ocultos
                if 'node_modules' in root or file.startswith('.'):
                    continue
                    
                # Verifica por padrões comuns em arquivos de entrada
                if file.endswith('.js'):
                    abs_path = os.path.join(root, file)
                    with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        if ('express' in content and 
                            ('app.listen' in content or 'server.listen' in content)):
                            rel_path = os.path.relpath(abs_path, self.project_path)
                            return (rel_path, abs_path)
                
                # Para Python
                elif file.endswith('.py'):
                    abs_path = os.path.join(root, file)
                    with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        if ('flask' in content.lower() and 'app.run' in content.lower() or
                            'fastapi' in content.lower()):
                            rel_path = os.path.relpath(abs_path, self.project_path)
                            return (rel_path, abs_path)
        
        return None

    def is_python_project(self) -> bool:
        """Verifica se o projeto atual é um projeto Python"""
        return (os.path.exists(os.path.join(self.project_path, 'requirements.txt')) or 
                os.path.exists(os.path.join(self.project_path, 'app.py')) or
                os.path.exists(os.path.join(self.project_path, 'main.py')))

    def generate_app_entry_file(self, port: int) -> Optional[str]:
        """Gera ou atualiza o arquivo de entrada da aplicação com a porta correta"""
        # Primeiro, tenta encontrar o arquivo de entrada existente
        entry_info = self.find_main_entry_file()
        
        if entry_info:
            entry_rel_path, entry_abs_path = entry_info
            print(f"✅ Arquivo de entrada encontrado: {entry_rel_path}")
            
            try:
                with open(entry_abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Procura por definição de porta e atualiza
                is_updated = False
                
                if self.is_node_project():
                    # Padrões para Node.js
                    port_patterns = [
                        (r'process\.env\.PORT\s*\|\|\s*\d+', f'process.env.PORT || {port}'),
                        (r'const\s+port\s*=\s*\d+', f'const port = {port}'),
                        (r'let\s+port\s*=\s*\d+', f'let port = {port}'),
                        (r'var\s+port\s*=\s*\d+', f'var port = {port}'),
                        (r'\.listen\(\s*\d+', f'.listen({port}')
                    ]
                    
                    updated_content = content
                    for pattern, replacement in port_patterns:
                        if re.search(pattern, updated_content):
                            updated_content = re.sub(pattern, replacement, updated_content)
                            is_updated = True
                    
                    # Adiciona definição de porta se não existir
                    if not is_updated and 'express' in content:
                        # Verifica se já existe uso de app.listen sem porta explícita
                        if re.search(r'app\.listen\(\s*\)', updated_content):
                            updated_content = re.sub(
                                r'app\.listen\(\s*\)',
                                f'app.listen({port})',
                                updated_content
                            )
                        elif not re.search(r'app\.listen\(', updated_content):
                            # Adiciona ao final do arquivo
                            updated_content += f"\n\napp.listen({port}, () => console.log(`Server running on port {port}`));\n"
                        
                        is_updated = True
                
                elif self.is_python_project():
                    # Padrões para Python
                    if 'flask' in content.lower():
                        port_patterns = [
                            (r'port\s*=\s*\d+', f'port = {port}'),
                            (r'\.run\(.*port=\d+', f'.run(port={port}'),
                            (r'\.run\(\s*\)', f'.run(host="0.0.0.0", port={port})')
                        ]
                        
                        updated_content = content
                        for pattern, replacement in port_patterns:
                            if re.search(pattern, updated_content):
                                updated_content = re.sub(pattern, replacement, updated_content)
                                is_updated = True
                        
                        # Adiciona definição de porta se não existir
                        if not is_updated and '.run(' in content:
                            updated_content = re.sub(
                                r'\.run\(',
                                f'.run(host="0.0.0.0", port={port}, ',
                                updated_content
                            )
                            is_updated = True
                    
                    elif 'fastapi' in content.lower():
                        # Para FastAPI
                        if 'uvicorn.run(' in content:
                            updated_content = re.sub(
                                r'uvicorn\.run\(.*?,\s*port=\d+',
                                f'uvicorn.run(app, port={port}',
                                content
                            )
                            is_updated = True
                
                # Se houve alterações, salva o arquivo
                if is_updated:
                    with open(entry_abs_path, 'w', encoding='utf-8') as f:
                        f.write(updated_content)
                    print(f"✅ Arquivo {entry_rel_path} atualizado com porta {port}")
                    return entry_rel_path
                else:
                    print(f"⚠️ Não foi possível atualizar a porta no arquivo {entry_rel_path}")
                    return entry_rel_path  # Retorna o arquivo mesmo sem alterações
                    
            except Exception as e:
                print(f"⚠️ Erro ao atualizar arquivo de entrada: {e}")
        
        # Se não encontrou ou não conseguiu atualizar um arquivo existente
        
        if self.is_node_project():
            # Para projetos Node.js, verifica se já existe uma pasta src
            src_path = os.path.join(self.project_path, 'src')
            if os.path.exists(src_path) and os.path.isdir(src_path):
                # Cria um app.js dentro da pasta src
                entry_file = 'src/app.js'
                entry_path = os.path.join(self.project_path, entry_file)
            else:
                # Cria um app.js na raiz
                entry_file = 'app.js'
                entry_path = os.path.join(self.project_path, entry_file)
            
            # Verifica se já existe package.json
            has_package = os.path.exists(os.path.join(self.project_path, 'package.json'))
            
            try:
                # Só cria um novo arquivo se não existir
                if not os.path.exists(entry_path):
                    with open(entry_path, 'w') as f:
                        f.write(f"""const express = require('express');
const app = express();
const port = process.env.PORT || {port};

app.use(express.json());

app.get('/', (req, res) => {{
  res.send('Hello World!');
}});

app.listen(port, () => {{
  console.log(`Server running on port ${{port}}`);
}});
""")
                    print(f"✅ Arquivo {entry_file} criado com porta {port}")
                
                # Adiciona express às dependências se não tiver package.json
                if not has_package:
                    package_path = os.path.join(self.project_path, 'package.json')
                    with open(package_path, 'w') as f:
                        f.write(f"""{{
  "name": "{self.project_name}",
  "version": "1.0.0",
  "description": "Auto-generated package.json",
  "main": "{entry_file}",
  "scripts": {{
    "start": "node {entry_file}"
  }},
  "dependencies": {{
    "express": "^4.18.2"
  }}
}}
""")
                    print("📦 Arquivo package.json criado com dependência express")
                else:
                    # Atualiza package.json existente com script de start
                    try:
                        package_path = os.path.join(self.project_path, 'package.json')
                        import json
                        with open(package_path, 'r') as f:
                            package_data = json.load(f)
                        
                        # Adiciona ou atualiza script de start
                        if 'scripts' not in package_data:
                            package_data['scripts'] = {}
                        package_data['scripts']['start'] = f"node {entry_file}"
                        
                        # Adiciona express se não estiver nas dependências
                        if 'dependencies' not in package_data:
                            package_data['dependencies'] = {}
                        if 'express' not in package_data['dependencies']:
                            package_data['dependencies']['express'] = '^4.18.2'
                        
                        with open(package_path, 'w') as f:
                            json.dump(package_data, f, indent=2)
                        print("📦 package.json atualizado com script de start e dependência express")
                    except Exception as e:
                        print(f"⚠️ Erro ao atualizar package.json: {e}")
                
                return entry_file
            except Exception as e:
                print(f"⚠️ Erro ao criar arquivo de entrada: {e}")
        
        elif self.is_python_project():
            # Para projetos Python
            src_path = os.path.join(self.project_path, 'src')
            if os.path.exists(src_path) and os.path.isdir(src_path):
                entry_file = 'src/app.py'
                entry_path = os.path.join(self.project_path, entry_file)
            else:
                entry_file = 'app.py'
                entry_path = os.path.join(self.project_path, entry_file)
            
            try:
                # Só cria um novo arquivo se não existir
                if not os.path.exists(entry_path):
                    with open(entry_path, 'w') as f:
                        f.write(f"""from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello World!"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port={port})
""")
                    print(f"✅ Arquivo {entry_file} criado com porta {port}")
                
                # Cria requirements.txt se não existir
                requirements_path = os.path.join(self.project_path, 'requirements.txt')
                if not os.path.exists(requirements_path):
                    with open(requirements_path, 'w') as f:
                        f.write("flask==2.0.1\ngunicorn==20.1.0\n")
                    print("📦 Arquivo requirements.txt criado com Flask e Gunicorn")
                
                return entry_file
            except Exception as e:
                print(f"⚠️ Erro ao criar arquivo de entrada: {e}")
        
        return None

    def deploy_to_vps(self) -> bool:
        """Deploy do projeto na VPS"""
        try:
            # Conecta à VPS
            if not self.connect_to_vps():
                return False
            
            # Encontra uma porta disponível
            port = self.find_available_port()
            self.deployed_port = port
            
            # Gera subdomínio baseado no nome do projeto
            subdomain = "api"#self.project_name.lower()
            self.deployed_domain = f"{subdomain}.{self.domain}"
            
            print(f"\n🚀 Iniciando deploy na VPS...")
            print(f"🔗 Domínio: https://{self.deployed_domain}")
            print(f"🔌 Porta: {port}")
            
            # Verifica e cria diretório base se não existir
            if not self.check_vps_directory("/var/www"):
                print("📂 Criando diretório /var/www...")
                if not self.run_vps_command("sudo mkdir -p /var/www && sudo chown -R $USER:$USER /var/www"):
                    raise Exception("Falha ao criar diretório /var/www")
            
            # Remove diretório antigo se existir
            print(f"🗑️ Removendo diretório antigo {self.project_name} se existir...")
            self.run_vps_command(f"rm -rf /var/www/{self.project_name}")
            
            # Configura o Git e clona o repositório
            print("📦 Clonando repositório do GitHub...")
            clone_command = f"""
            cd /var/www && \
            git config --global credential.helper store && \
            echo "https://{self.github_username}:{self.github_token}@github.com" > ~/.git-credentials && \
            git clone https://github.com/{self.github_username}/{self.project_name}.git
            """
            if not self.run_vps_command(clone_command):
                raise Exception("Falha ao clonar repositório")
            
            # Detecta tipo de projeto e instala dependências
            if self.is_node_project():
                print("📦 Instalando dependências Node.js...")
                install_command = f"""
                cd /var/www/{self.project_name} && \
                npm install
                """
                if not self.run_vps_command(install_command):
                    print("⚠️ Aviso: Falha ao instalar dependências, mas continuando...")
                
                # Configura PM2
                print("🔄 Configurando PM2...")
                
                # Primeiro, identifica o arquivo de entrada principal
                entry_info = self.find_main_entry_file()
                if entry_info:
                    entry_rel_path, _ = entry_info
                    
                    if entry_rel_path.endswith('.js'):
                        # Para aplicações Node.js
                        print(f"📄 Usando arquivo de entrada: {entry_rel_path}")
                        pm2_command = f"""
                        cd /var/www/{self.project_name} && \
                        pm2 delete {self.project_name} 2>/dev/null || true && \
                        pm2 start {entry_rel_path} --name {self.project_name}
                        """
                    else:
                        # Tenta o script start no package.json
                        pm2_command = f"""
                        cd /var/www/{self.project_name} && \
                        pm2 delete {self.project_name} 2>/dev/null || true && \
                        pm2 start npm --name {self.project_name} -- start
                        """
                else:
                    # Tenta com os nomes de arquivo padrão
                    pm2_command = f"""
                    cd /var/www/{self.project_name} && \
                    pm2 delete {self.project_name} 2>/dev/null || true && \
                    if [ -f "src/app.js" ]; then
                        pm2 start src/app.js --name {self.project_name}
                    elif [ -f "src/server.js" ]; then
                        pm2 start src/server.js --name {self.project_name}
                    elif [ -f "src/index.js" ]; then
                        pm2 start src/index.js --name {self.project_name}
                    elif [ -f "app.js" ]; then
                        pm2 start app.js --name {self.project_name}
                    elif [ -f "server.js" ]; then
                        pm2 start server.js --name {self.project_name}
                    elif [ -f "index.js" ]; then
                        pm2 start index.js --name {self.project_name}
                    else
                        pm2 start npm --name {self.project_name} -- start
                    fi
                    """
                if not self.run_vps_command(pm2_command):
                    # Tenta com diferentes arquivos de entrada
                    for entry_file in ['server.js', 'index.js']:
                        alt_pm2_command = f"""
                        cd /var/www/{self.project_name} && \
                        pm2 delete {self.project_name} 2>/dev/null || true && \
                        pm2 start {entry_file} --name {self.project_name}
                        """
                        if self.run_vps_command(alt_pm2_command):
                            break
                    else:
                        raise Exception("Falha ao configurar PM2")
            
            elif self.is_python_project():
                print("📦 Instalando dependências Python...")
                install_command = f"""
                cd /var/www/{self.project_name} && \
                pip install -r requirements.txt || pip3 install -r requirements.txt
                """
                if not self.run_vps_command(install_command):
                    print("⚠️ Aviso: Falha ao instalar dependências, mas continuando...")
                
                # Configura Gunicorn com PM2
                print("🔄 Configurando Gunicorn com PM2...")
                pm2_command = f"""
                cd /var/www/{self.project_name} && \
                pm2 delete {self.project_name} 2>/dev/null || true && \
                pm2 start "gunicorn app:app -b 0.0.0.0:{port}" --name {self.project_name}
                """
                if not self.run_vps_command(pm2_command):
                    # Tenta com outro arquivo de entrada
                    alt_pm2_command = f"""
                    cd /var/www/{self.project_name} && \
                    pm2 delete {self.project_name} 2>/dev/null || true && \
                    pm2 start "gunicorn main:app -b 0.0.0.0:{port}" --name {self.project_name}
                    """
                    if not self.run_vps_command(alt_pm2_command):
                        raise Exception("Falha ao configurar Gunicorn com PM2")
            
            else:
                print("⚠️ Tipo de projeto não reconhecido. Assumindo Node.js...")
                pm2_command = f"""
                cd /var/www/{self.project_name} && \
                npm install && \
                pm2 delete {self.project_name} 2>/dev/null || true && \
                pm2 start app.js --name {self.project_name}
                """
                self.run_vps_command(pm2_command)
            
            # Configura Nginx
            print("🌐 Configurando Nginx...")
            nginx_config = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {self.deployed_domain};

    location / {{
        proxy_pass http://localhost:{port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }}
}}
"""
            # Salva configuração do Nginx
            config_path = f"/etc/nginx/sites-available/{self.deployed_domain}"
            nginx_commands = f"""
            echo '{nginx_config}' | sudo tee {config_path} > /dev/null && \
            sudo ln -sf {config_path} /etc/nginx/sites-enabled/ && \
            sudo nginx -t && \
            sudo systemctl reload nginx
            """
            if not self.run_vps_command(nginx_commands):
                raise Exception("Falha ao configurar Nginx")
            
            # Configura SSL com Certbot
            print("🔒 Configurando certificado SSL com Certbot...")
            certbot_command = f"""
            sudo certbot --nginx -d {self.deployed_domain} --non-interactive --agree-tos --email {self.github_username}@users.noreply.github.com
            """
            if not self.run_vps_command(certbot_command):
                print("⚠️ Aviso: Falha ao configurar SSL, mas o site ainda estará disponível via HTTP")
            
            print(f"\n✅ Deploy concluído com sucesso!")
            print(f"🌐 Seu site está disponível em: https://{self.deployed_domain}")
            print(f"📝 Porta utilizada: {port}")
            
            return True
            
        except Exception as e:
            print(f"❌ Erro ao fazer deploy na VPS: {e}")
            return False
        finally:
            if self.ssh:
                self.ssh.close()
                print("🔒 Conexão SSH encerrada")

    def run(self) -> bool:
        """Executa todo o processo de deploy"""
        print("="*60)
        print("🚀 SISTEMA DE DEPLOY AUTOMÁTICO: GITHUB + VPS")
        print("="*60)
        print(f"📂 Projeto: {self.project_name}")
        print(f"📁 Caminho: {self.project_path}")
        print("="*60)
        
        # Etapa 1: Verificar e criar repositório no GitHub
        if not self.create_github_repo():
            print("❌ Falha ao criar/verificar repositório no GitHub. Abortando.")
            return False
        
        # Etapa 2: Atualiza entrada do app com porta disponível
        port = self.base_port + hash(self.project_name) % 100  # Gera uma porta baseada no nome do projeto
        entry_file = self.generate_app_entry_file(port)
        
        # Etapa 3: Enviar projeto para o GitHub
        github_result = self.push_to_github()
        if not github_result:
            print("⚠️ Falha ao enviar projeto para o GitHub, mas continuaremos com o deploy na VPS.")
        
        # Etapa 4: Deploy na VPS
        if not self.deploy_to_vps():
            print("❌ Falha ao fazer deploy na VPS.")
            return False
        
        # Resumo final
        print("\n" + "="*60)
        print("✅ DEPLOY FINALIZADO COM SUCESSO!")
        print("="*60)
        print(f"📂 Projeto: {self.project_name}")
        print(f"🔗 Repositório GitHub: {self.github_url}")
        print(f"🌐 Site: https://{self.deployed_domain}")
        print(f"🔌 Porta: {self.deployed_port}")
        print("="*60)
        
        return True


if __name__ == "__main__":
    # Configurações
    config = {
        # GitHub
        'github_username': 'lombarde1',
        'github_token': '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',
        
        # VPS
        'vps_host': '147.93.36.100',
        'vps_username': 'root',
        'vps_password': 'Darkvips2k24@',
        'base_port': 8600,  # Porta base para aplicações
        'domain': 'botengaja.cloud'  # Domínio principal
    }
    
    # Verifica argumentos da linha de comando
    if len(sys.argv) > 1:
        # Se um caminho foi especificado, muda para esse diretório
        project_path = sys.argv[1]
        try:
            os.chdir(project_path)
            print(f"📂 Mudando para o diretório: {project_path}")
        except Exception as e:
            print(f"❌ Erro ao mudar para o diretório {project_path}: {e}")
            sys.exit(1)
    
    # Inicia o deploy
    deployer = AutoDeploy(**config)
    deployer.run()