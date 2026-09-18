/**
 * Paged.js ships no types. Only the one class the app uses is declared, rather
 * than pretending to describe the whole library.
 */
declare module 'pagedjs' {
  export class Previewer {
    preview(
      content: string | Element,
      stylesheets?: string[],
      renderTo?: Element,
    ): Promise<unknown>
  }
}
