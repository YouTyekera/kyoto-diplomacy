# HTTPS/WSS integration fixture

`fixture-cert.pem` / `fixture-key.pem` are deliberately public, self-signed **test-only** TLS data for `kyoto-web.test` / `kyoto-server.test`. Never install them in Render or use them for real TLS. Render supplies managed HTTPS certificates.

`npm run test:production` builds to ignored `dist-public`, starts the real production server entry, and uses two separate local HTTPS origins with browser DNS mapping. Only test browser contexts ignore this fixture certificate. Application code never bypasses TLS verification. No debug endpoint is installed on the production server.

The integration suite checks a genuine WSS upgrade, public-origin CORS, three clients, direct map commands, adjudication, reload/reconnect, safe missing BGM, seven WAV URLs, and a mocked cold-start health response. It does not verify an actual Render URL, real Free sleep, or another internet connection; repeat those after deployment.
