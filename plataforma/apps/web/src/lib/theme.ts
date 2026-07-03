const TEMA_KEY = "auxiliar-contable:tema";

export type Tema = "light" | "dark";

export function temaActual(): Tema {
  const guardado = localStorage.getItem(TEMA_KEY);
  if (guardado === "light" || guardado === "dark") return guardado;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  localStorage.setItem(TEMA_KEY, tema);
}

/** Llamar una vez al arrancar la app (antes del primer render). */
export function inicializarTema() {
  document.documentElement.dataset.theme = temaActual();
}
