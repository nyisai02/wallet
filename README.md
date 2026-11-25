# MyBank Wallet

This Angular app connects to an existing Demo Wallet sandbox account using its registered mobile number (MSISDN). It reads the account balance and ledger, posts cash deposits and withdrawals, and sends Mojaloop transfers through the configured Demo Wallet connector. The standalone preview uses sample data.

## Run locally

Start the Demo Wallet backend with its database and Mojaloop connector configured. By default, the Angular dev server proxies `/api` to `http://127.0.0.1:8081`. To use another Demo Wallet backend, set the target before starting Angular.

```powershell
$env:DEMO_WALLET_API_URL = 'http://127.0.0.1:8082'
npm run dev
```

Open `http://localhost:4200`. Enter an existing demo account's MSISDN and the currency configured for its ledger. Select the transfer route connected to that backend.

## Guinea staging

The `stg-hub-guinea-gitops` repository defines two Demo Wallet API hosts. Choose the instance where the account's MSISDN is registered.

| GitOps instance | `DEMO_WALLET_API_URL` |
| --- | --- |
| `wallet1` | `https://backend-wallet1.stg-hub.gimpss.com` |
| `wallet2` | `https://backend-wallet2.stg-hub.gimpss.com` |

For example, to use `wallet1`, stop the current Angular dev server, then run this from the wallet project.

```powershell
$env:DEMO_WALLET_API_URL = 'https://backend-wallet1.stg-hub.gimpss.com'
npm run dev -- --proxy-config proxy.conf.mjs
```

On the connection screen, enter `GNF` and select **Mojaloop vNow**. Both staging backends use this route to reach the Guinea hub. The backend exposes its endpoints at the root, and Angular removes the browser's `/api` prefix when forwarding requests.

## Liberia staging

Accounts registered on `frontend-wallet1.stg-pm4ml.libpss.com` can use the same MSISDN in MyBank by connecting to that deployment's backend. Both interfaces use the same balance and history.

```powershell
$env:DEMO_WALLET_API_URL = 'https://backend-wallet1.stg-pm4ml.libpss.com'
npm run dev -- --proxy-config proxy.conf.mjs
```

Select **Mojaloop vNow**. Use the currency you use for transfers in the existing Demo Wallet, such as `LRD` or `USD`. If the backend returns HTTP 403, check that the computer running the Angular proxy is on a network allowed by the Liberia staging deployment.

## Transfer routes

| Transfer route | Demo Wallet connector setting |
| --- | --- |
| Mojaloop vNow (default) | `MOJALOOP_CC_VNOW_API_URL` |
| LCC | `MOJALOOP_API_URL` |
| ThitsaConnect | `MOJALOOP_THITSACONNECT_API_URL` |

To send a payment, select the recipient provider, enter their identifier and the amount, and review the Mojaloop quote. Confirm once. If the result is pending, use **Check transfer status** with the same transfer reference. Connected QR payments use external Demo Wallet codes for the selected route and currency.

`npm run build` builds the frontend. When hosting the build, route same-origin `/api/*` to the Demo Wallet backend and strip the `/api` prefix. Keep this deployment inside the sandbox. Demo Wallet's MSISDN lookup provides no production authentication.
