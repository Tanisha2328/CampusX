function pdfText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
}

export function createCertificatePdf({ studentName, eventTitle, eventDate, certificateId }) {
  const lines = [
    ['CAMPUSX UNIVERSITY', 26, 550],
    ['CERTIFICATE OF PARTICIPATION', 18, 490],
    [`This certifies that ${studentName}`, 14, 420],
    ['participated in', 14, 390],
    [eventTitle, 22, 350],
    [`held on ${eventDate}`, 14, 310],
    [`Certificate ID: ${certificateId}`, 11, 220],
    [`Verify at /api/certificates/verify/${certificateId}`, 10, 195],
  ]
  const commands = [
    '0.13 0.24 0.4 rg',
    'BT',
    ...lines.map(([text, size, y]) => `/F1 ${size} Tf 1 0 0 1 72 ${y} Tm (${pdfText(text)}) Tj`),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}\nendstream`,
  ]
  let document = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, 'ascii'))
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(document, 'ascii')
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(document, 'ascii')
}
