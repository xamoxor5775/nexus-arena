# Google Ads · Nexus Arena Chile

Landing de anuncios: `https://nexusarena.cl/?utm_source=google&utm_medium=cpc&utm_campaign=search_cl`

## 1. Cuenta y conversión

1. Entra a [ads.google.com](https://ads.google.com) con la cuenta de facturación de Chile (CLP).
2. Objetivos → Conversiones → Resumen → **Nueva acción de conversión** → Sitio web → `https://nexusarena.cl`
3. Crea **Compra acceso** (categoría Compra / Purchase).
   - Valor: 1000 CLP
   - Recuento: una por transacción
   - Ventana de clic: 7 días (el acceso dura 30, pero la compra es inmediata)
4. Elige la etiqueta de Google (`gtag`). Copia:
   - ID `AW-XXXXXXXXX` → `GOOGLE_ADS_ID`
   - Etiqueta `XXXXXXX` (la parte después de `/`) → `GOOGLE_ADS_PURCHASE_LABEL`
5. Opcional: segunda conversión **Inicio de checkout** (`GOOGLE_ADS_CHECKOUT_LABEL`) como secundaria, no de puja.
6. En el servidor (`~/nexus-arena/.env`) pega las variables y reinicia:

```
GOOGLE_ADS_ID=AW-XXXXXXXXX
GOOGLE_ADS_PURCHASE_LABEL=abcDEFghijk
# GOOGLE_ADS_CHECKOUT_LABEL=
docker compose up -d
```

El sitio ya dispara `purchase` cuando Flow confirma el pago (`transaction_id` = orden Flow) y `begin_checkout` al ir a pagar. No hace falta reconstruir la imagen.

## 2. Campaña Search (la primera)

- Tipo: **Búsqueda**
- Objetivo: **Ventas** (usa Compra acceso como conversión principal)
- Red: solo Búsqueda de Google (sin Display partner al inicio)
- Ubicación: **Chile** · presencia en · idioma **español**
- Presupuesto inicial: **$8.000–12.000 CLP / día**
- Estrategia: **Maximizar conversiones** (o Maximizar clics los primeros 3 días si no hay historial)
- Horario: 16:00–01:00 Chile, más fuerte viernes–domingo
- URL final: la landing de arriba
- Exclusiones de contenido: juegos para niños, descargas dudosas

### Palabras clave (coincidencia de frase)

```
"fps online chile"
"juego shooter navegador"
"deathmatch online"
"fps sin descargar"
"arena fps browser"
"juego fps en el navegador"
"shooter online chile"
"jugar quake en el navegador"
```

Exactas:

```
[nexus arena]
[fps browser]
[deathmatch chile]
```

Amplias (con cuidado, 20% del presupuesto):

```
fps online
shooter browser
```

### Negativas

```
gratis
crack
apk
descargar exe
roblox
fortnite
minecraft
valorant
warzone
csgo
apuestas
casino
empleo
trabajo
```

### Anuncio RSA (copia tal cual)

Títulos (hasta 30 caracteres):

1. Entra. Apunta. Domina.
2. FPS en el navegador
3. Acceso 30 días · $1.000
4. Nexus Arena Chile
5. Sin instalar nada
6. Deathmatch en The Crucible
7. Paga con Flow y entra
8. Cinco armas · bots letales
9. Juega ya en Chrome
10. Arena industrial 88 m
11. Shooter directo al browser
12. The Crucible te espera

Descripciones:

1. Compra tu llave por $1.000 CLP. Deathmatch FPS en el navegador, 30 días de acceso. Pagas con Flow.
2. Cinco armas, jump pads y bots que no perdonan. Sin descarga: abre Chrome y entra al pozo.
3. Acceso único con Flow Chile. Guarda tu llave y juega cuando quieras durante 30 días.

Ruta visible: `nexusarena.cl` / `acceso` / `crucible`

Llamado a la acción: **Comprar** / **Jugar**

## 3. Campaña Demand Gen (semana 2)

Cuando Search tenga 15+ conversiones:

- Objetivo: ventas
- Audiencias: aficionados a videojuegos, YouTube gaming Chile, remarketing de visitantes de 7 días
- Creatividades: poster `/media/nexus-arena-demo-poster.jpg` + demo `/media/nexus-arena-demo.mp4`
- Mismo anuncio de valor: $1.000 · 30 días · sin instalar

## 4. Qué no hacer

- No optimices a “clics” más de 3–4 días.
- No dejes Display abierto el día 1 (quema presupuesto).
- No uses la conversión de “entrar a la arena”: mucha gente entra con llave ya pagada.
- No dispares la compra si el pago Flow sigue pendiente.
