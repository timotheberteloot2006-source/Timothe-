// Propose au navigateur d'enregistrer un fichier généré dans la page
export function telechargerFichier(contenu: BlobPart, nomFichier: string, type: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier
  lien.click()
  // Laisse au navigateur le temps de démarrer le téléchargement
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
