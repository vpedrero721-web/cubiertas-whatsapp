# Cubiertas WhatsApp

Prototipo de atención por WhatsApp para cubiertas postformadas: catálogo,
precotizaciones y derivación a un asesor. El backend usa WhatsApp Cloud API y
Node.js 20 o superior.

## Desarrollo local

1. Entra en `whatsapp-backend` y copia `.env.example` a `.env`.
2. Completa las variables de Meta siguiendo
   [la guía del backend](./whatsapp-backend/README.md). No publiques `.env` ni
   compartas los tokens.
3. Con Node.js 20.6 o superior, inicia el servidor con
   `node --env-file=.env server.js`.
4. Ejecuta `npm test` para verificar el flujo conversacional.

El despliegue inicial en Render se configura desde [render.yaml](./render.yaml).
La guía del backend explica la configuración del webhook, las credenciales y
las precauciones antes de habilitar cotizaciones para clientes.
