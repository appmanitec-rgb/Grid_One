export function confirmDeletion(subject = "este item") {
  if (typeof window === "undefined") return false;
  return window.confirm(`Tem certeza que deseja excluir ${subject}?`);
}
