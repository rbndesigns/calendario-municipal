# Liga municipal

Página estática para GitHub Pages inspirada en la referencia. No requiere servidor ni dependencias: al abrirla consulta mediante JSONP el API CKAN del Ayuntamiento de Madrid, un acceso entre dominios documentado por el portal.

## Equipos configurados

`data.js` ya contiene los seis perfiles configurados: HA BASKET y HA BASKET SESI (ambos Alevín mixto), Benjamín mixto, e Infantil masculino G1, G3 y G4. Los dos equipos alevines pertenecen al mismo grupo oficial, pero se resuelven por su nombre de equipo para mostrar calendarios independientes. Cada ficha tiene el `Codigo_grupo` vigente para 2026/2027 y consulta directamente esos partidos. Si los códigos cambian en la siguiente temporada, la página los vuelve a resolver por el nombre del grupo. Si un nombre aparece repetido, se puede fijar `groupId`.

La portada abre directamente en **PRÓXIMOS PARTIDOS**, con tarjetas de los siguientes encuentros de los seis equipos. Al seleccionar una tarjeta se abre debajo el detalle, los resultados por jornada y la clasificación.

No hace falta escribir jornadas, fechas, pabellones ni marcadores. El programa los descarga de la temporada vigente. La clasificación se calcula a partir de partidos finalizados (`Estado` F o N); las actas pendientes no cuentan todavía.

El Ayuntamiento actualiza el conjunto semanalmente, normalmente los miércoles. La página consulta la última publicación cada vez que se abre; GitHub Pages no ejecuta un servidor propio.

## Publicar en GitHub Pages

El sitio se sirve desde la rama `main`, carpeta `/ (root)`.

## Fuente y atribución

Los partidos proceden de [Competiciones deportivas municipales de deportes colectivos · temporada en curso](https://datos.madrid.es/dataset/211549-0-juegos-deportivos-actual), recurso CSV `211549-0-juegos-deportivos-actual-csv`, con licencia CC BY 4.0. El pie de la página enlaza al portal.

