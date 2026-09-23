# Deploying AutoList AI (production)

Target: an **Ubuntu VPS** (Hostinger VPS, or any Node-capable host) with **Node.js 22+**,
Nginx reverse proxy, and free HTTPS. Domain: **autolist.ai** (DNS at GoDaddy).

> Classic shared/PHP hosting cannot run this app — it needs a Node runtime and a persistent disk.

Everywhere below, **run the commands in your VPS SSH session** unless noted. Never paste secrets into chat.

---

## 0) Push the code to GitHub (from your Windows machine)
```
cd E:\AUTOMATION\autolist-ai
git push -u origin main
```

## 1) Point the domain (GoDaddy → your VPS)
In GoDaddy DNS for `autolist.ai`:
- **A** record: `@` → your VPS IP
- **A** record: `www` → your VPS IP
Wait for DNS to propagate (a few minutes to a couple of hours).

## 2) Prepare the server (once)
```bash
# Node 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
node -v            # must be v22.x or newer
```

## 3) Get the code onto the server
```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/smtvashistha-eng/autolist-ai.git
cd autolist-ai
sudo npm ci --omit=dev || sudo npm install --omit=dev
sudo mkdir -p data && sudo chown -R www-data:www-data /var/www/autolist-ai
```

## 4) Create the .env (secrets stay on the server)
Generate strong secrets **on the server** and write the file:
```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
DATA_KEY=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
sudo tee /var/www/autolist-ai/.env >/dev/null <<EOF
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://autolist.ai
SESSION_SECRET=$SESSION_SECRET
DATA_KEY=$DATA_KEY
EOF
sudo chown www-data:www-data /var/www/autolist-ai/.env && sudo chmod 600 /var/www/autolist-ai/.env
```
Add optional keys later (edit `.env`, then `sudo systemctl restart autolist`):
`ANTHROPIC_API_KEY`, `IMAGE_API_KEY`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `SMTP_URL`, `EMAIL_FROM`.
The app runs fully without them (deterministic AI fallbacks, billing in test mode).

## 5) Run it as a service (systemd)
```bash
sudo cp /var/www/autolist-ai/deploy/autolist.service /etc/systemd/system/autolist.service
# if `which node` is NOT /usr/bin/node, edit ExecStart in that file to the correct path
sudo systemctl daemon-reload
sudo systemctl enable --now autolist
sudo systemctl status autolist --no-pager        # should be active (running)
curl -s http://127.0.0.1:3000/api/health          # {"ok":true,...}
```

## 6) Nginx + HTTPS
```bash
sudo cp /var/www/autolist-ai/deploy/nginx.conf /etc/nginx/sites-available/autolist
sudo ln -sf /etc/nginx/sites-available/autolist /etc/nginx/sites-enabled/autolist
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# free HTTPS certificate
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d autolist.ai -d www.autolist.ai --redirect -m you@email.com --agree-tos -n
```
Visit **https://autolist.ai** — you're live.

## 7) Updating after code changes
```bash
cd /var/www/autolist-ai && sudo git pull && sudo npm ci --omit=dev && sudo systemctl restart autolist
```
Database migrations run automatically on start.

## 8) Backups (important — SQLite holds all data)
```bash
# nightly copy of the DB + uploaded files
sudo tar czf /root/autolist-backup-$(date +%F).tgz -C /var/www/autolist-ai data
```
Consider a cron job + off-server copy.

---

## Alternative: Docker
```bash
docker build -t autolist-ai .
docker run -d --name autolist -p 3000:3000 \
  -e NODE_ENV=production -e PUBLIC_URL=https://autolist.ai \
  -e SESSION_SECRET=$(openssl rand -hex 48) -e DATA_KEY=$(openssl rand -hex 48) \
  -v /srv/autolist-data:/app/data autolist-ai
```
Put Nginx + certbot in front the same way (steps 6).

## Notes
- Razorpay webhook URL (Phase 7): `https://autolist.ai/api/webhooks/razorpay`.
- Single instance uses the in-process job worker + in-memory rate limiter; move to Redis/BullMQ before scaling horizontally.
