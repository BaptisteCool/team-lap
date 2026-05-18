// Shared Chronoplace API types. Used by:
//   - mock data files (mockChronoplace_<pos>_<dossard>_<short>.ts)
//   - mockChronoplace.ts builder
//   - chronoplace.ts action (real API parsing)

export interface ChronoplaceRawLap {
  id: number
  nom: string
  position_classement: string
  rang: number
  dossard: string
  nom_equipe: string
  nom_equipe_slug: string
  nom_coureur: string
  prenom_coureur: string
  temps: string
  ecart: string
  tours_plus_rapide: string | null
  nb_tours: number
  evenement_id: number
  type_classement_id: number
  created_at: string
  updated_at: string
}
