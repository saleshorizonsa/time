# ZKTeco MB20 Connection

## Recommended Mode: ADMS Push

Use ADMS when the remote site has only the MB20 device and no PC. The device opens the connection to your server, so the remote site does not need a static IP.

```text
MB20 -> Internet -> Attendance Server
```

Your server needs a reachable domain or public IP:

```text
https://attendance.yourdomain.com
```

## MB20 Menu Values

Exact menu labels can vary by firmware, but look for:

```text
Comm.
Cloud Server Setting
ADMS
Server Setting
HTTPS
```

Typical settings:

```text
ADMS: Enabled
Server Address: attendance.yourdomain.com
Server Port: 443
HTTPS: Enabled
```

If HTTPS is not supported:

```text
Server Address: your-public-ip-or-ddns-name
Server Port: 5000 or 8080
HTTPS: Disabled
```

The server must expose:

```text
GET  /iclock/cdata
POST /iclock/cdata
GET  /iclock/getrequest
POST /iclock/devicecmd
```

## Direct Pull Backup

Direct pull uses the ZKTeco device protocol on TCP port `4370`.

Use only with:

- VPN, or
- router port forwarding plus firewall allowlist for your server IP.

Example `.env`:

```env
ZK_MODE=hybrid
ZK_DEVICE_HOST=branch-ddns.example.com
ZK_DEVICE_PORT=4370
ZK_DEVICE_PASSWORD=0
ZK_DEVICE_TIMEOUT_MS=10000
```

Avoid exposing `4370` to the public internet without restrictions.

## Testing

From the server:

```powershell
Invoke-WebRequest http://localhost:5000/iclock/ping
```

For direct pull connectivity:

```powershell
Test-NetConnection branch-ddns.example.com -Port 4370
```

The dashboard sync panel includes:

- `Pull Access DB`
- `Pull MB20`
- last sync status
- recent error logs
