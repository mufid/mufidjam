# mufidjam

Two-hours Hacks from Async Cafe Workshop

A multiplayer whiteboard application built with Ruby and tldraw. The backend uses Falcon with async-websocket to handle real-time WebSocket connections, synchronizing drawing state and cursor presence across all participants in a room. The frontend is a React app powered by tldraw v4.

To run locally, install dependencies and build the frontend: `cd frontend && npm install && npm run build && cd ..`, then start the server with `bundle exec falcon serve --bind http://localhost:9292`. The app is deployed via Kamal to `mufidjam.apps.skyandmurmur.com` using a local Docker registry and Let's Encrypt for TLS. Deploy with `kamal deploy`.


