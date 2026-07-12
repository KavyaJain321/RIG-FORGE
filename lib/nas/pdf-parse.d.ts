declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdf(buffer: Buffer): Promise<{ text: string; numpages: number; info: unknown }>
  export default pdf
}
