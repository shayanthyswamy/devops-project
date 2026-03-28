# Cake Billing System (HTML/CSS/JS)

This is a simple **Cake Billing System** with **local reports** (daily/monthly) stored in your browser using `localStorage`.

## Run Locally

Double-click `start-server.bat`, then open:

- `http://127.0.0.1:8000/index.html`
- `http://127.0.0.1:8000/report.html`

## Run with Docker

Build image:

`docker build -t cake-billing .`

Run container:

`docker run --name cake-billing-app -p 8080:80 -d cake-billing`

Open:

- `http://127.0.0.1:8080/index.html`
- `http://127.0.0.1:8080/report.html`

Stop/remove container:

`docker stop cake-billing-app && docker rm cake-billing-app`

## Notes

- Data is saved in your browser only (no server/database).
- If you clear browser storage, saved invoices will be removed.

