
Sync a faire:

7- partager le club avec quelqu'un

Now I want to be able to share a club with someone.
Let's assume it is only available for logged in person.
Sharing a club should share a code to enter. This code is unique and displayed in the club details screen,
Once the user enter the code in another device, it will fetch the data.
Every update in any device is reflected in the cloud.
Think about a simple mecanism to avoid concurrent update from 2 devices that overrides each others

As security rules:
- every one can add participants, but only the club owner can delete one (so don't propose it in the app)
- only the owner can add/delete sessions, delete club and share club.



À venir :
- Creer le club: Rajouter une image/logo

  


- Sync : 
    - D'abord il faut partager le club. Ca genere un code.
    - Dans l'autre device , on rentre ce code, au lieu de cliquer sur "creer un club" et le club est rajouté.
    - Tout est synchronisé, on peut demarrer.




- Sync multi device:
    - sauver les données dans supabase en premier. Me donner les tables a creer (ou index, ou autre. Tout le setup supabase a faire)
    - Le but est de partager le planning/presence entre plusieurs professeurs
    - Quand un professeur note des presences/absences, tous les autres doivent aussi le voir (pas real time, quelques minutes ok)
    - Quand on cree une session, elle doit etre dispo partout. Idem pour un eleve.
    - Comment faire pour pas qu'une "erreur" (genre suppression d'une session), impacte tous les devices? 





- Supabase
- OAuth
- Partager le club avec quelqu'un (link share + passcode)
- Sync



Plus tard: 
Comment gerer le multi club ?
