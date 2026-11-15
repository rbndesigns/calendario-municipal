/* Escribe cada nombre como aparece en el Open Data de Madrid.
   Si un equipo aparece en más de un grupo, rellena su groupId. */
window.LEAGUE = {
  brandName: "Grupo de Deportes Madrid",
  competition: "JUEGOS DEPORTIVOS MUNICIPALES",
  season: "Temporada actual",
  leagueName: "Grupo municipal",
  category: "BALONCESTO",
  sourceNote: "Datos oficiales del Ayuntamiento de Madrid · actualización diaria a las 20:15",
  contactLabel: "Contacto",
  contactUrl: "",
  openData: {
    api: "https://datos.madrid.es/api/3/action/datastore_search",
    matchesResource: "211549-0-juegos-deportivos-actual-csv",
    pageSize: 1000
  },
  teams: [
    { id: "ha-alevin", name: "HA BASKET", label: "HA BASKET · Alevín mixto", groupName: "JDM CEN SAB MAÑ MBC ALE MIX Samaranch", groupId: "30639", color: "#f4d74e", initials: "HA" },
    { id: "ha-benjamin", name: "HA BASKET", label: "HA BASKET · Benjamín mixto", groupName: "JDM CEN SAB MAÑ MBC BEN MIX Samaranch", groupId: "30638", color: "#76c5ee", initials: "HA" },
    { id: "ha-bb", name: "HA BASKET BB", label: "HA BASKET BB · Infantil masculino G1", groupName: "JDM LAT BC INF MAS G1", groupId: "31117", color: "#ef8b68", initials: "BB" },
    { id: "ha-c", name: "HA BASKET C", label: "HA BASKET C · Infantil masculino G3", groupName: "JDM LAT BC INF MAS G3", groupId: "32946", color: "#8dd1a3", initials: "HC" },
    { id: "ha-d", name: "HA BASKET D", label: "HA BASKET D · Infantil masculino G4", groupName: "JDM LAT BC INF MAS G4", groupId: "32947", color: "#c8a7f0", initials: "HD" },
    { id: "ha-sesi-alevin", name: "HA BASKET SESI", label: "HA BASKET SESI · Alevín mixto", groupName: "JDM CEN SAB MAÑ MBC ALE MIX Samaranch", groupId: "30639", color: "#f1b64a", initials: "HS" }
  ]
};

