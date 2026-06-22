#!/bin/bash
# One-time server setup for KwestKarz on Ubuntu.
# Run as the ubuntu user: bash setup-server.sh
set -e

DOMAIN="${1:-}"

echo "=== Installing PostgreSQL ==="
sudo apt-get update -q
sudo apt-get install -y postgresql postgresql-contrib
# Create app DB and user — edit password before running
sudo -u postgres psql -c "CREATE USER kwestkarz WITH PASSWORD 'CHANGE_ME';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE \"KwestKarz\" OWNER kwestkarz;" 2>/dev/null || true
echo "PostgreSQL ready. Update deploy/env.template password and set it in /opt/kwestkarz/env."

echo "=== Installing .NET 9 runtime ==="
wget -q https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb \
  -O packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
sudo apt-get update -q
# Ubuntu 26.04 only ships .NET 10 in its repos — install .NET 9 runtime via Microsoft's script
curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
chmod +x /tmp/dotnet-install.sh
sudo /tmp/dotnet-install.sh --runtime aspnetcore --channel 9.0 --install-dir /usr/share/dotnet
sudo ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet

echo "=== Installing nginx and certbot ==="
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "=== Creating app directories ==="
sudo mkdir -p /opt/kwestkarz/app
sudo mkdir -p /opt/kwestkarz/storage
sudo mkdir -p /var/www/kwestkarz
sudo chown -R ubuntu:ubuntu /opt/kwestkarz
sudo chown -R www-data:www-data /var/www/kwestkarz
sudo chmod -R 775 /opt/kwestkarz/storage

echo "=== Installing systemd service ==="
sudo cp "$(dirname "$0")/kwestkarz.service" /etc/systemd/system/kwestkarz.service
sudo systemctl daemon-reload
sudo systemctl enable kwestkarz

echo "=== Configuring nginx ==="
if [ -n "$DOMAIN" ]; then
  sed "s/YOUR_DOMAIN/$DOMAIN/g" "$(dirname "$0")/nginx.conf" \
    | sudo tee /etc/nginx/sites-available/kwestkarz > /dev/null
else
  # No domain — listen on port 80 with server_name _
  cat "$(dirname "$0")/nginx.conf" \
    | sed 's/server_name YOUR_DOMAIN;/server_name _;/' \
    | sudo tee /etc/nginx/sites-available/kwestkarz > /dev/null
  echo "WARNING: No domain provided. HTTPS/certbot skipped."
fi
sudo ln -sf /etc/nginx/sites-available/kwestkarz /etc/nginx/sites-enabled/kwestkarz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "=== Granting ubuntu permission to restart the service without a password ==="
echo "ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart kwestkarz, /bin/systemctl is-active kwestkarz" \
  | sudo tee /etc/sudoers.d/kwestkarz-restart > /dev/null
sudo chmod 440 /etc/sudoers.d/kwestkarz-restart

if [ -n "$DOMAIN" ]; then
  echo ""
  echo "=== Running certbot for $DOMAIN ==="
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN"
  echo "Certbot done. Auto-renewal is managed by the certbot timer."
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next: create /opt/kwestkarz/env with your secrets (see deploy/env.template),"
echo "then run: sudo systemctl start kwestkarz"
