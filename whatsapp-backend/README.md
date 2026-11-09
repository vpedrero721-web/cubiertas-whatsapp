# Backend de WhatsApp — Cubiertas Postformadas de Temuco

Backend de demostración con Node.js 20+ y WhatsApp Cloud API. Incluye webhook,
catálogo, precotización, validación de medidas y notificación opcional a un asesor.

## Configuración

1. Copia `.env.example` a `.env` y completa las credenciales de Meta. No subas
   `.env` ni compartas el token; `.gitignore` excluye secretos y datos persistidos.
2. Para desarrollo local con Node.js 20.6+, ejecuta `node --env-file=.env server.js`.
   En hosting, carga las variables en el panel seguro y ejecuta `npm start`.
3. Publica `/webhook` con HTTPS y configura la misma URL en Meta.
4. Usa `META_VERIFY_TOKEN` para la verificación del webhook. Los mensajes POST
   también se validan usando `META_APP_SECRET`.
5. Configura `HUMAN_PHONE_NUMBER` con el número de WhatsApp habilitado para
   recibir notificaciones del negocio.
6. Opcionalmente, agrega URLs HTTPS públicas a las imágenes del catálogo.

El backend usa las APIs nativas de Node.js; no necesita instalar dependencias.
La ruta `/health` muestra el estado del servicio y el resumen de la cola, sin
exponer mensajes ni teléfonos.

Ejecuta `npm test` para verificar el cálculo, la persistencia, la deduplicación y
el recorrido conversacional usando una API de WhatsApp simulada.

## Despliegue inicial en Render

El archivo `../render.yaml` define un servicio Render Starter con disco persistente.
Conecta en Render un repositorio cuya raíz sea la carpeta del prototipo y usa
**New > Blueprint** para detectar ese archivo. Configura los valores secretos
solicitados por Render; nunca los añadas al repositorio:

- `META_APP_SECRET`: App Secret de la app de Meta.
- `META_VERIFY_TOKEN`: valor aleatorio elegido por ti; debe coincidir en Meta.
- `WHATSAPP_ACCESS_TOKEN`: token de acceso válido para Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del número de prueba.
- `HUMAN_PHONE_NUMBER`: número del asesor en formato internacional, sin `+`.

El contacto de asesor indicado para el proyecto se debe introducir en esta
variable privada de Render, no en archivos versionados. `QUOTES_ENABLED` queda
en `false` hasta que el negocio apruebe los precios. Luego cambia esa variable
a `true` en Render y vuelve a desplegar. El catálogo no mostrará precios mientras
esté desactivada la cotización automática.

Cuando Render muestre el dominio HTTPS, configura en Meta la URL
`https://<dominio-render>/webhook`, el mismo `META_VERIFY_TOKEN` y la suscripción
al campo `messages`. Envía un mensaje desde un teléfono autorizado y revisa
`https://<dominio-render>/health` antes de activar la cotización.

El disco persistente y la instancia Starter de Render tienen costo. Revisa los
precios y la disponibilidad del plan en Render antes de crear el servicio. Para
la prueba con un número de desarrollo, limita el acceso a los teléfonos de
prueba configurados en Meta y no uses datos de clientes reales.

## Flujo

- Menú: cotizar, ver catálogo o hablar con un asesor.
- Paso 1: seleccionar una de las terminaciones disponibles.
- Paso 2: indicar metros, cortes a 45°, pegados de cenefa y perforaciones.
- Paso 3: recibir el desglose, total CLP y fecha de vencimiento a 15 días.
- Solicitudes superiores a 3,66 m y mesones de laboratorio se derivan al asesor.
- También se puede escribir `/asesor` o `/humano`.

Las tarifas, descripciones e imágenes deben ser aprobadas/configuradas por el
negocio. Las conversaciones y eventos pendientes se guardan en
`data/bot-state.json` (o en la ruta definida por `STORAGE_FILE`), se conservan
hasta 30 días y los mensajes repetidos de WhatsApp se deduplican por ID. Esta
implementación es para una sola instancia; varias instancias necesitan un
almacenamiento compartido y una cola distribuida. Restringe el acceso al disco y
usa cifrado del volumen en producción porque el archivo contiene teléfonos y
estado de conversación.

La cola persiste eventos antes de responder al webhook y reintenta fallos hasta
10 veces. Si un fallo ocurre después de que WhatsApp aceptó una respuesta, un
reintento puede enviar esa respuesta de nuevo; revisa monitoreo y la cola `failed`
antes de operar con clientes reales.

La precotización se entrega como texto. No se genera un PDF en este prototipo.
