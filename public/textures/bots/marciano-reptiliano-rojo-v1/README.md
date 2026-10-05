# Kit de bot: Marciano reptiliano rojo

Recursos gráficos locales preparados para una futura variante de bot. No están conectados al juego ni cambian los bots actuales.

## Archivos

- `red-martian-turnaround-v1.png` — referencia de cuerpo completo, frente y espalda, con detalles de materiales.
- `red-reptile-face-v1.webp` — propuesta de textura/referencia frontal de rostro escamado y ojos ámbar.
- `red-reptile-skin-albedo-v1.webp` — color de piel reptiliana roja.
- `red-martian-armor-albedo-v1.webp` — color de placas de armadura granate y tejido grafito.
- `red-martian-boots-albedo-v1.webp` — color de botas espaciales blindadas.
- `red-martian-emissive-v1.webp` — canales luminosos naranja/ámbar sobre fondo oscuro.

## Consideraciones para construir el bot

- El proyecto actual genera bots con geometría procedural Three.js; estos archivos son referencias y mapas de material, no un modelo 3D ni un atlas UV compatible automáticamente.
- Los mapas de color y emisión son fuentes estilizadas. No se generaron mapas calibrados de normales, rugosidad, metalness ni oclusión ambiental.
- Las texturas pensadas para repetición deben revisarse en sus bordes y probarse sobre la geometría antes de publicarse.
- La integración deberá asignar materiales distintos a piel, armadura, botas y emisión, conservando el rendimiento del juego.
