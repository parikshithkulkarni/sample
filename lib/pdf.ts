export async function extractText(buffer: Buffer): Promise<string> {
  // Dynamic import avoids pdf-parse running test-file code at module load time
  // which crashes Vercel serverless functions
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text;
}
