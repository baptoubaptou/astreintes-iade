# Astreintes IADE

Application web interne de gestion des astreintes IADE au bloc opératoire.

Elle permet de planifier, attribuer et faire évoluer les astreintes sur plusieurs lignes (Greffe, Urgences, Obstétrique), de gérer les échanges entre IADE et d'assurer une répartition équitable via un système de points.

Le périmètre fonctionnel et technique est décrit dans le [cahier des charges](../cahier-des-charges-astreintes-iade.md).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite
- Auth.js (NextAuth v5) + bcrypt

## Démarrage

```bash
npm install
cp .env.example .env
# Renseigner AUTH_SECRET (openssl rand -base64 32) et DATABASE_URL si besoin
npm run db:migrate
npm run db:seed
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

## Déploiement Docker

L'application peut être exécutée dans un conteneur avec SQLite persisté sur un volume hôte.

### Prérequis

- Docker et Docker Compose
- Fichier `.env` à la racine du projet (copier depuis `.env.example`)

### Configuration

```bash
cp .env.example .env
```

Variables indispensables :

| Variable | Description |
|---|---|
| `DATABASE_URL` | En local : `file:./dev.db` (relatif au dossier `prisma/`). Sous Docker, surchargée par Compose : `file:/app/data/dev.db` |
| `AUTH_SECRET` | Secret Auth.js — générer avec `openssl rand -base64 32` |
| `AUTH_URL` | URL publique de l'app (ex. `http://localhost:3000`) |
| `RESEND_API_KEY` | Clé API Resend pour l'envoi des e-mails de notification |
| `RESEND_FROM` | Expéditeur (`Nom <email@domaine-verifie>`), domaine configuré dans Resend |

La base SQLite est stockée dans `./data/dev.db` sur l'hôte (volume `./data:/app/data`). Elle n'est **pas** incluse dans l'image Docker.

### Build et lancement

```bash
mkdir -p data
docker compose up -d --build
```

L'application est accessible sur :
- [http://localhost:3000](http://localhost:3000) — accès direct au conteneur `app`
- [http://localhost](http://localhost) — via Caddy sur le port 80, uniquement avec `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` (si le port 80 est libre sur l'hôte)

### Migrations Prisma (premier démarrage et mises à jour)

Les migrations sont appliquées **automatiquement** à chaque démarrage du conteneur via `prisma migrate deploy` dans le script `docker-entrypoint.sh`. C'est l'option retenue car elle garantit que le schéma est toujours à jour après un `docker compose up` sans étape manuelle oubliée.

Pour peupler des données de démonstration **une seule fois** après le premier lancement (depuis l'hôte, la base étant dans `./data`) :

```bash
DATABASE_URL="file:../data/dev.db" npm run db:seed
```

### Commandes utiles

```bash
# Vérifier l'état de santé du conteneur app
docker compose ps
curl http://localhost:3000/api/health
```

Le healthcheck Docker interroge `GET /api/health` (réponse `{ "status": "ok" }`) toutes les 30 s. Le service Caddy ne démarre qu'une fois l'application déclarée saine.

```bash
# Voir les logs
docker compose logs -f app

# Arrêter
docker compose down

# Reconstruire après modification du code
docker compose up -d --build
```

### Image de base

Le Dockerfile utilise `node:22-bookworm-slim` (Debian, glibc) plutôt qu'Alpine : `bcrypt` et le moteur Prisma SQLite sont plus fiables sur ARM64 avec cette base, notamment pour les modules natifs.

### Sauvegardes automatiques (Raspberry Pi)

Le script `scripts/backup.sh` copie la base SQLite vers `backups/astreintes-AAAA-MM-JJ-HHMM.db`, purge les sauvegardes plus anciennes que la rétention configurée (30 jours par défaut) et journalise chaque exécution dans `backups/backup.log`.

**Résolution du chemin de la base** (par ordre de priorité) :

1. `DB_PATH` — si la variable est explicitement définie, elle est utilisée telle quelle.
2. `DATABASE_URL` — sinon, le script lit `DATABASE_URL` depuis l'environnement ou le fichier `.env` à la racine du projet, puis en extrait le chemin SQLite (`file:…`). Les chemins relatifs sont interprétés comme Prisma le fait : relatifs au dossier `prisma/` (ex. `file:./dev.db` → `prisma/dev.db` ; sous Docker `file:/app/data/dev.db` reste absolu).

```bash
# Sauvegarde manuelle (lit DATABASE_URL depuis .env en local)
./scripts/backup.sh

# Surcharge explicite du chemin
DB_PATH=./data/dev.db ./scripts/backup.sh

# Rétention personnalisée (ex. 14 jours)
RETENTION_DAYS=14 ./scripts/backup.sh
```

**Planification quotidienne à 3 h du matin** (crontab sur le Raspberry Pi) :

```bash
crontab -e
```

Ajouter la ligne suivante en adaptant le chemin absolu du projet :

```cron
0 3 * * * cd /chemin/vers/astreintes-iade && ./scripts/backup.sh >> /chemin/vers/astreintes-iade/backups/cron.log 2>&1
0 3 * * * cd /chemin/vers/astreintes-iade && npm run cron:quotidien >> /chemin/vers/astreintes-iade/backups/cron.log 2>&1
```

Le script `npm run cron:quotidien` exécute chaque jour la clôture des offres de bourse expirées (`cloturerOffresExpirees`) et, si la configuration l'exige, l'envoi automatique du planning publié par e-mail. Une seule exécution quotidienne suffit.

Vérifier les exécutions : `tail -f backups/backup.log` (résultat du script) et `backups/cron.log` (sortie crontab éventuelle).

> **Recommandation** : copiez régulièrement le dossier `backups/` vers un support **externe au Raspberry Pi** (clé USB, NAS ou cloud personnel) pour limiter la perte de données en cas de panne matérielle du Pi — cette copie hors site n'est pas automatisée ici, mais elle complète utilement les sauvegardes locales.

**Restaurer une sauvegarde** (procédure pas à pas) :

1. **Identifier la sauvegarde** à restaurer dans `backups/` (ex. `astreintes-2026-07-11-0300.db`).
2. **Arrêter le conteneur** pour éviter toute écriture concurrente sur la base :
   ```bash
   docker compose down
   ```
3. **Sauvegarder l'état actuel** (précaution) :
   ```bash
   cp data/dev.db "data/dev.db.avant-restauration-$(date +%Y%m%d-%H%M)"
   ```
4. **Remplacer la base** par le fichier de sauvegarde :
   ```bash
   cp backups/astreintes-2026-07-11-0300.db data/dev.db
   ```
5. **Redémarrer l'application** :
   ```bash
   docker compose up -d
   ```
6. **Contrôler** que l'application répond et que les données attendues sont présentes (`docker compose logs -f app`, puis connexion via le navigateur).

## Déploiement public

Exposition de l'application sur Internet via **Cloudflare Tunnel**, sans ouvrir de port sur le routeur, sans VPN, sans Tailscale et sans installation côté client.

### Architecture

```
Internet
   ↓
Cloudflare
   ↓
Cloudflare Tunnel (cloudflared)
   ↓
Caddy (reverse proxy, port 80)
   ↓
Application Next.js (service app, port 3000)
```

Le service `caddy` est inclus dans le `docker-compose.yml` principal. Le connecteur `cloudflared` est défini dans un fichier Compose séparé et n'est activé que pour le déploiement public.

### Prérequis

- Domaine géré par Cloudflare (ex. `baptou.me`)
- Compte Cloudflare avec accès à **Zero Trust** / **Cloudflare Tunnel**
- Raspberry Pi (ou autre hôte) avec Docker, comme décrit dans la section [Déploiement Docker](#déploiement-docker)

### Étapes de déploiement

1. **Ajouter le domaine à Cloudflare**  
   Transférer ou configurer la zone DNS du domaine dans le tableau de bord Cloudflare.

2. **Créer un Cloudflare Tunnel**  
   Dans [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel**.  
   Choisir le connecteur **Docker** et noter l'**UUID du tunnel** (`<TUNNEL_ID>`).

3. **Télécharger les credentials du tunnel**  
   Cloudflare fournit un fichier JSON nommé `<TUNNEL_ID>.json`. Conservez-le en lieu sûr.

4. **Placer les fichiers aux emplacements attendus**

   ```bash
   cp cloudflare/config.yml.example cloudflare/config.yml
   # Éditer cloudflare/config.yml : remplacer <TUNNEL_ID> et <DOMAIN>
   cp /chemin/vers/<TUNNEL_ID>.json cloudflare/credentials/<TUNNEL_ID>.json
   ```

   | Fichier | Emplacement |
   |---|---|
   | Configuration du tunnel | `cloudflare/config.yml` (copié depuis `config.yml.example`) |
   | Credentials du tunnel | `cloudflare/credentials/<TUNNEL_ID>.json` |

5. **Configurer le `config.yml`**  
   Remplacer les placeholders `<TUNNEL_ID>` et `<DOMAIN>` (ex. `astreintes.baptou.me`). Le service cible doit rester `http://caddy:80`.

6. **Configurer l'application**  
   Dans `.env`, définir l'URL publique pour Auth.js :

   ```bash
   AUTH_URL="https://astreintes.baptou.me"
   ```

7. **Démarrer la stack de base** (application + Caddy, sans tunnel) :

   ```bash
   docker compose up -d --build
   ```

8. **Activer le tunnel Cloudflare** :

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d
   ```

### Accès utilisateurs

Une fois le tunnel actif et le DNS configuré dans Cloudflare, les utilisateurs accèdent à l'application à l'adresse :

**https://astreintes.baptou.me**

Aucun VPN, Tailscale ou logiciel client n'est requis : le trafic transite par Cloudflare (HTTPS terminé côté Cloudflare) jusqu'au Raspberry Pi via le tunnel chiffré.

### Documentation officielle Cloudflare Tunnel

- [Vue d'ensemble Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Créer un tunnel (guide de démarrage)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)
- [Configuration du fichier config.yml](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-configuration/)
- [Image Docker cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/docker/)

### Commandes utiles (tunnel)

```bash
# Voir les logs du tunnel
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml logs -f cloudflared

# Arrêter uniquement le tunnel (l'application reste en ligne en local)
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml stop cloudflared

# Arrêter toute la stack (app + caddy + tunnel)
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml down
```

## Routes principales

| Route | Accès | Description |
|---|---|---|
| `/mes-astreintes` | IADE + CADRE | Mes astreintes (futures, passées, points) |
| `/planning` | IADE + CADRE | Planning collectif (calendrier mois/semaine) |
| `/admin/planning` | CADRE | Gestion manuelle + future simulation |
| `/admin/lignes` | CADRE | Lignes d'astreinte et poids |
| `/admin/qualifications` | CADRE | Matrice des habilitations |

## État d'avancement (roadmap CDC)

| Phase | Statut |
|---|---|
| 1 — Socle (Next.js, Prisma, auth) | ✅ |
| 2 — Planning manuel, lignes, qualifications, calendrier | ✅ en cours |
| 3 — Algorithme de points + **simulation obligatoire** | 🔜 |
| 4 — Échanges et bourse aux astreintes | 🔜 |
| 5 — Exports et déploiement Docker | ✅ exports / Docker / Caddy / Cloudflare Tunnel |

### Point clé CDC §3.2 (simulation)

L'algorithme d'attribution **ne doit jamais écrire directement en base**. Workflow imposé :

1. Simulation (dry-run) → aperçu figé
2. Validation cadre → enregistrement
3. Rejet → relance possible
4. Ajustements manuels via `/admin/planning`

Le socle est préparé dans `src/server/planning-simulation.ts` ; l'UI placeholder est sur `/admin/planning`.

## Données de test

**Mot de passe commun : `password123`**

| Rôle | Email |
|---|---|
| Cadre | `cadre@test.local` |
| IADE | `marie.dupont@test.local`, `thomas.bernard@test.local`, etc. |

```bash
npm run db:seed
```

## Authentification

Copier `.env.example` vers `.env` et renseigner au minimum `DATABASE_URL` et `AUTH_SECRET` :

```bash
cp .env.example .env
openssl rand -base64 32
```
