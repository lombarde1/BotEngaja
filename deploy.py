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
            push_commands = [
                ["git", "add", "."],
                ["git", "commit", "-m", f"Auto deploy at {commit_time}"],
                ["git", "push", "-u", "origin", "main", "--force"]  # Força o push para garantir que funcione
            ]
            
            for cmd in push_commands:
                try:
                    result = subprocess.run(cmd, check=True, cwd=self.project_path, capture_output=True, text=True)
                    print(f"🔄 {cmd[0]} {cmd[1]}: {result.stdout}")
                except subprocess.CalledProcessError as e:
                    print(f"⚠️ Aviso ao executar {cmd[0]} {cmd[1]}: {e}")
                    # Se o commit falhar por não ter alterações, continua
                    if "nothing to commit" in e.stdout or "no changes added" in e.stdout:
                        print("✅ Sem alterações para commit, continuando...")
                        continue
                    # Se a branch principal for 'master' em vez de 'main'
                    if cmd[0] == "git" and cmd[1] == "push" and "main" in cmd:
                        try:
                            # Tenta com 'master' em vez de 'main'
                            cmd[3] = "master"
                            subprocess.run(cmd, check=True, cwd=self.project_path)
                            print(f"✅ Push realizado para branch 'master'")
                            continue
                        except subprocess.CalledProcessError:
                            pass
                    
                    # Se o push falhar, pode ser por falta de branch local
                    if cmd[0] == "git" and cmd[1] == "push":
                        try:
                            # Cria uma branch local e tenta novamente
                            subprocess.run(["git", "checkout", "-b", "main"], cwd=self.project_path)
                            subprocess.run(cmd, check=True, cwd=self.project_path)
                            print(f"✅ Branch 'main' criada e push realizado")
                            continue
                        except subprocess.CalledProcessError:
                            pass
                    
                    print(f"❌ Falha ao executar {cmd}")
                    return False
            
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
        return os.path.exists(os.path.join(self.project_path, 'package.json'))

    def is_python_project(self) -> bool:
        """Verifica se o projeto atual é um projeto Python"""
        return (os.path.exists(os.path.join(self.project_path, 'requirements.txt')) or 
                os.path.exists(os.path.join(self.project_path, 'app.py')) or
                os.path.exists(os.path.join(self.project_path, 'main.py')))

    def generate_app_entry_file(self, port: int) -> Optional[str]:
        """Gera ou atualiza o arquivo de entrada da aplicação com a porta correta"""
        if self.is_node_project():
            # Para projeto Node.js, procura app.js ou server.js
            entry_files = ['app.js', 'server.js', 'index.js']
            
            for entry_file in entry_files:
                entry_path = os.path.join(self.project_path, entry_file)
                if os.path.exists(entry_path):
                    try:
                        with open(entry_path, 'r') as f:
                            content = f.read()
                        
                        # Procura por definição de porta e atualiza
                        if 'process.env.PORT' in content:
                            content = re.sub(r'process\.env\.PORT\s*\|\|\s*\d+', f'process.env.PORT || {port}', content)
                        else:
                            # Adiciona definição de porta se não existir
                            port_definition = f"const port = process.env.PORT || {port};\n"
                            listen_statement = f"app.listen(port, () => console.log(`Server running on port ${port}`));\n"
                            
                            if 'express' in content and 'app.listen' not in content:
                                content += '\n' + listen_statement
                            elif 'http.createServer' in content:
                                content = content.replace('http.createServer', 
                                                         port_definition + 'http.createServer')
                        
                        with open(entry_path, 'w') as f:
                            f.write(content)
                        
                        print(f"✅ Arquivo {entry_file} atualizado com porta {port}")
                        return entry_file
                    except Exception as e:
                        print(f"⚠️ Erro ao atualizar {entry_file}: {e}")
            
            # Se não encontrou nenhum arquivo de entrada, cria um app.js básico
            entry_file = 'app.js'
            entry_path = os.path.join(self.project_path, entry_file)
            
            try:
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
                
                # Adiciona express às dependências se não estiver no package.json
                package_path = os.path.join(self.project_path, 'package.json')
                if os.path.exists(package_path):
                    try:
                        import json
                        with open(package_path, 'r') as f:
                            package_data = json.load(f)
                        
                        dependencies = package_data.get('dependencies', {})
                        if 'express' not in dependencies:
                            print("📦 Adicionando express às dependências...")
                            dependencies['express'] = '^4.18.2'
                            package_data['dependencies'] = dependencies
                            
                            with open(package_path, 'w') as f:
                                json.dump(package_data, f, indent=2)
                    except Exception as e:
                        print(f"⚠️ Erro ao atualizar package.json: {e}")
                
                return entry_file
            except Exception as e:
                print(f"⚠️ Erro ao criar arquivo de entrada: {e}")
        
        elif self.is_python_project():
            # Para projeto Python, procura app.py ou main.py
            entry_files = ['app.py', 'main.py']
            
            for entry_file in entry_files:
                entry_path = os.path.join(self.project_path, entry_file)
                if os.path.exists(entry_path):
                    try:
                        with open(entry_path, 'r') as f:
                            content = f.read()
                        
                        # Procura por definição de porta e atualiza
                        if 'port =' in content:
                            content = re.sub(r'port\s*=\s*\d+', f'port = {port}', content)
                        elif '.run(' in content:
                            content = re.sub(r'\.run\(.*port=\d+', f'.run(port={port}', content)
                        
                        with open(entry_path, 'w') as f:
                            f.write(content)
                        
                        print(f"✅ Arquivo {entry_file} atualizado com porta {port}")
                        return entry_file
                    except Exception as e:
                        print(f"⚠️ Erro ao atualizar {entry_file}: {e}")
            
            # Se não encontrou nenhum arquivo de entrada, cria um app.py básico
            entry_file = 'app.py'
            entry_path = os.path.join(self.project_path, entry_file)
            
            try:
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
            subdomain = self.project_name.lower()
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
                pm2_command = f"""
                cd /var/www/{self.project_name} && \
                pm2 delete {self.project_name} 2>/dev/null || true && \
                pm2 start app.js --name {self.project_name}
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
        if not self.push_to_github():
            print("❌ Falha ao enviar projeto para o GitHub. Abortando.")
            return False
        
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
        'domain': 'operacao2k25.shop'  # Domínio principal
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