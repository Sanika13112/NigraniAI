# Put ShopSmart online 24/7 for free: Oracle Cloud Always Free

Oracle's Always Free tier includes an Arm server with **2 CPUs and 12 GB of memory**. That is enough for all 9 ShopSmart services, the website and the log shipper, at no monthly cost. The data stays in your two Supabase projects, as now.

It uses the same Docker setup as the AWS guide (`docker-compose.cloud.yml`); only the server creation differs.

**Before you start:**
- Sign-up asks for a card to verify you; Always Free resources are not charged. Some sign-ups are refused, and popular regions sometimes have no free Arm capacity. If that happens, try again later, or use `DEPLOY-AWS.md`.
- Oracle reduced the free Arm allowance in June 2026 (from 4 CPUs / 24 GB to 2 CPUs / 12 GB). Check the current limits on Oracle's "Always Free Resources" page before you create the server.
- Oracle may reclaim Always Free servers that sit idle for long periods. A site people actually use is normally fine.

## 1. Account (15 min)

1. Sign up at **oracle.com/cloud/free**. Choose home region **India West (Mumbai)** or **India South (Hyderabad)**. The home region can't be changed later.
2. Stay on the free tier; you don't need to upgrade.

## 2. Create the server (10 min)

Go to **Menu → Compute → Instances → Create instance**:

| Field | Value |
|---|---|
| Name | `shopsmart` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere → VM.Standard.A1.Flex**, 2 OCPUs, 12 GB memory (marked *Always Free-eligible*) |
| Networking | Create a new virtual cloud network and public subnet; **Assign a public IPv4 address: Yes** |
| SSH keys | **Generate a key pair for me → Save private key**. Save it as `C:\Users\<you>\.ssh\shopsmart-oracle.key` |
| Boot volume | 50 GB (the default) is enough |

Click **Create**. If it says *Out of capacity*, try another availability domain or try again later. Write down the **Public IP address**.

## 3. Open ports 80 and 443 in Oracle's network (5 min)

1. Open the instance, then **Subnet → Default Security List → Add Ingress Rules**.
2. Add two rules:
   - Source CIDR `0.0.0.0/0`, TCP, destination port `80`
   - Source CIDR `0.0.0.0/0`, TCP, destination port `443`

SSH (port 22) is already open. To limit it to your own IP, edit that rule's source to `<your IP>/32`.

The firewall inside Ubuntu also blocks 80/443 on Oracle images; `deploy/server-setup.sh` opens them for you in step 5.

## 4. Free web address

Make a DuckDNS name pointing to the public IP, as in `DEPLOY-AWS.md` step 3.

## 5. Log in, upload and set up (15 min)

In **cmd**, once only:
```
icacls "%USERPROFILE%\.ssh\shopsmart-oracle.key" /inheritance:r /grant:r "%USERNAME%:R"
```

Then follow `DEPLOY-AWS.md` steps 4–6 with two differences:
- the key is `shopsmart-oracle.key`
- the address is your Oracle public IP

```
ssh -i "%USERPROFILE%\.ssh\shopsmart-oracle.key" ubuntu@<public IP>
```

`bash deploy/server-setup.sh` installs Docker, adds swap and opens ports 80/443 in Ubuntu's firewall.

## 6. Start it

Follow `DEPLOY-AWS.md` step 7:
```
docker compose -f docker-compose.cloud.yml --env-file deploy/cloud.env up -d --build
```

The first build on the Arm server takes about 20–40 minutes. All images used have Arm versions. Then open `https://<your-name>.duckdns.org`.

**Stop the copy on your PC** (`stop-project.bat`) once the online one runs, so only one copy writes to your Supabase database.

The same server keeps running day and night. Updating, logs and troubleshooting are as in `DEPLOY-AWS.md`.
