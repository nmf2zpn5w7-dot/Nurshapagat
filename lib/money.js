export function formatKzt(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₸";
}
