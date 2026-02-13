# NextIntranet

## KiCad Integration - HTTP Library

NextIntranet provides a KiCad HTTP Library integration, allowing you to use components from the warehouse directly in KiCad.

### Setup

1. Download the library configuration file from:
   ```
   http://<your-server>/api/kicad/nextIntranet.kicad_httplib
   ```

2. In KiCad, go to **Preferences → Manage Symbol Libraries**

3. Click **+** to add a new library

4. Select library type **HTTP Library**

5. Point to the downloaded `.kicad_httplib` file

### Configuration

The `root_url` in the `.kicad_httplib` file is automatically generated based on the `SITE_URL` setting in `nextintranet_backend/nextintranet_backend/settings.py`.

To change the public URL, set the `SITE_URL` variable in your `.env` file or directly in `settings.py`:

```
SITE_URL=https://your-public-domain.com
```

## HW Agent

Local service for printing and serial device access (barcode scanners). The agent runs on the machine with connected printers/scanners and exposes an HTTP/WebSocket API.

### Running the Agent

```bash
cd nextintranet_agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run with configuration
NEXT_AGENT_ALLOWED_ORIGINS="http://localhost:9000" \
NEXT_AGENT_TOKEN="your-secret-token" \
python3 app.py
```

For background execution (e.g. via tmux):

```bash
tmux new-session -d -s agent '
  NEXT_AGENT_ALLOWED_ORIGINS="http://localhost:9000,http://localhost:5173" \
  NEXT_AGENT_TOKEN="token" \
  python3 /path/to/nextintranet_agent/app.py
'
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_AGENT_ID` | `agent-local` | Agent identifier |
| `NEXT_AGENT_TOKEN` | _(none)_ | Auth token (required for secure access) |
| `NEXT_AGENT_ALLOWED_ORIGINS` | _(none)_ | Comma-separated CORS origins (e.g. `http://localhost:9000`) |
| `NEXT_AGENT_STATION_ID` | _(none)_ | Default station ID for events |
| `NEXT_AGENT_HOST` | `0.0.0.0` | Bind address |
| `NEXT_AGENT_PORT` | `9101` | Listen port |

### Frontend Configuration

In NextIntranet UI, go to **Hardware** page and add a new agent:

- **Base URL:** `http://localhost:9101`
- **Token:** value of `NEXT_AGENT_TOKEN`
- **Capabilities:** `print` (or leave empty for all)
- **Agent config (JSON):**

```json
{
  "print": {
    "defaultPrinter": "TSC_TE310_Network",
    "options": {
      "media": "Custom.60x40mm"
    }
  }
}
```

For A4 printer as default:

```json
{
  "print": {
    "defaultPrinter": "Canon-LBP663C-UFR-II"
  }
}
```

### Troubleshooting

**WebSocket connection failed:**
- Check that `NEXT_AGENT_ALLOWED_ORIGINS` includes the frontend origin (e.g. `http://localhost:9000`)
- Verify agent is running: `curl -H "X-Agent-Token: <token>" http://localhost:9101/v1/status`

**No printers found:**
- Ensure CUPS is installed and printers are configured: `lpstat -a`
- Install `pycups`: `pip install pycups`
