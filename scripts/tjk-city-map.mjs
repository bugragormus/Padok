const normalizeVenue = (value) => {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export const tjkCities = [
  { id: "1", name: "Adana", aliases: ["Adana"] },
  { id: "3", name: "İstanbul", aliases: ["İstanbul", "Istanbul"] },
  { id: "5", name: "Ankara", aliases: ["Ankara"] }
];

export const findTjkCity = (venue) => {
  const normalizedVenue = normalizeVenue(venue);
  return tjkCities.find((city) => {
    return city.aliases.some((alias) => normalizeVenue(alias) === normalizedVenue);
  }) ?? null;
};

