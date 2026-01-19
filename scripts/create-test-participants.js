/**
 * Script pour créer 20 participants de test
 * À exécuter dans la console du navigateur ou via React Native
 * 
 * Usage:
 * 1. Copier ce code
 * 2. Dans l'app, ouvrir un club
 * 3. Coller dans la console ou créer un bouton temporaire qui exécute createTestParticipants()
 */

const testParticipants = [
  { first_name: "Antoine", last_name: "BERNARD" },
  { first_name: "Sophie", last_name: "MARTIN" },
  { first_name: "Lucas", last_name: "DUBOIS" },
  { first_name: "Emma", last_name: "THOMAS" },
  { first_name: "Hugo", last_name: "ROBERT" },
  { first_name: "Léa", last_name: "PETIT" },
  { first_name: "Tom", last_name: "DURAND" },
  { first_name: "Chloé", last_name: "LEROY" },
  { first_name: "Mathis", last_name: "MOREAU" },
  { first_name: "Sarah", last_name: "SIMON" },
  { first_name: "Nathan", last_name: "LAURENT" },
  { first_name: "Manon", last_name: "LEFEBVRE" },
  { first_name: "Enzo", last_name: "MICHEL" },
  { first_name: "Camille", last_name: "GARCIA" },
  { first_name: "Maxime", last_name: "DAVID" },
  { first_name: "Inès", last_name: "BERTRAND" },
  { first_name: "Arthur", last_name: "ROUX" },
  { first_name: "Jade", last_name: "VINCENT" },
  { first_name: "Paul", last_name: "FOURNIER" },
  { first_name: "Zoé", last_name: "MOREL" }
];

// Pour React Native / Expo
async function createTestParticipants(clubId, dataService) {
  console.log('Création de 20 participants de test...');
  
  for (let i = 0; i < testParticipants.length; i++) {
    const participant = {
      club_id: clubId,
      first_name: testParticipants[i].first_name,
      last_name: testParticipants[i].last_name,
      grade: '',
      level: '',
      notes: 'TEST - À SUPPRIMER'
    };
    
    try {
      await dataService.saveParticipant(participant);
      console.log(`✓ ${i + 1}/20 - ${participant.first_name} ${participant.last_name}`);
    } catch (error) {
      console.error(`✗ Erreur pour ${participant.first_name} ${participant.last_name}:`, error);
    }
  }
  
  console.log('✅ Tous les participants de test ont été créés !');
}

// Export pour usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testParticipants, createTestParticipants };
}
