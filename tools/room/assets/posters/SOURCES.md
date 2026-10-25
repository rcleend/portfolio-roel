# Poster artwork sources

Every piece on the attic walls is **third-party copyrighted artwork**, used by the site owner's choice as
placeholder decoration for now. **Licence status of every row: third-party, clear or replace before publishing.**
Committing or deploying `public/room/posters-*.webp` publishes these images; keep the build unpublished until each
row is cleared or swapped for original or licensed art.

The masters are an authoring input and are not committed (`POSTERS_SOURCE`, see `tools/room/README.md`).
`masters.json` pins each master's sha256 and pixel size; several came through an image proxy (re-encoded at the
same pixel size), so the stage asserts the hashes rather than re-downloading. Crops are (u0, v0, u1, v1) from the
top-left of the master.

| Id | Topic | Artwork | Rights holder | Master (under `POSTERS_SOURCE`) | Crop | Source URL |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Radiohead | In Rainbows cover (2007) | Radiohead / XL Recordings; art by Stanley Donwood | `music/radiohead-in-rainbows/in-rainbows-album-cover-4000.jpg` | full | <https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/dd/50/c7/dd50c790-99ac-d3d0-5ab8-e3891fb8fd52/634904032463.png/4000x4000bb.jpg> |
| M2 | RATM | The Battle of Los Angeles cover (1999) | Rage Against the Machine / Epic Records | `music/rage-against-the-machine/ratm-battle-of-los-angeles-cover.jpg` | full | <https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/10/7d/eb/107deb76-ee81-8151-2375-7b18f67591f0/074646963029.jpg/4000x4000bb.jpg> |
| M3 | RATM | band wordmark | Rage Against the Machine / Epic Records | `music/rage-against-the-machine/ratm-logo-wordmark.png` | full | <https://upload.wikimedia.org/wikipedia/commons/5/58/Rage_Against_the_Machine_%28Logo%29.png> |
| M4 | RATM | Coachella 2007 line-up poster | Goldenvoice (Coachella 2007); band: RATM | `music/rage-against-the-machine/coachella-2007-official-lineup-poster-480x640.jpg` | full | <http://web.archive.org/web/20070411124506im_/http://www.coachella.com/images/mainPoster.jpg> |
| M5 | RATM | Rock the Bells 2007 San Bernardino set-times flyer | Guerilla Union (Rock the Bells 2007); band: RATM | `music/rage-against-the-machine/rock-the-bells-2007-san-bernardino-set-times-flyer-500x694.jpg` | full | <http://web.archive.org/web/20070813012858im_/http://www.rockthebells.net/images/sb_set_times.jpg> |
| M6 | Radiohead | modified bear logo | Radiohead / XL Recordings; art by Stanley Donwood | `music/radiohead-in-rainbows/radiohead-modified-bear-logo-sticker.png` | full | <https://static.wikia.nocookie.net/radiohead/images/b/b1/Modified_bear.png/revision/latest?cb=20180725000630> |
| B1 | Green Day | 2004 Trends retail band poster | Trends International / Reprise Records | `music/green-day-american-idiot/green-day-2004-trends-band-poster-1087x1482.jpg` | full | <https://www.authenticvintageposters.com/cdn/shop/files/GREENN-M_2048x.jpg?v=1769296938> |
| R1 | RuneScape | Void Knight wallpaper (Apr 2007) | Jagex | `games/runescape/wallpaper-Void_Knight_1920x1200.jpg` | full | <https://oldschool.runescape.wiki/w/File:Void_Knight_1920x1200.jpg> |
| R2 | RuneScape | RuneScape 2 logo (2004-2008) | Jagex | `games/runescape/runescape-2-logo-2004-2008-444x142.png` | full | <https://oldschool.runescape.wiki/w/File:RuneScape_2_logo.png> |
| F1 | Guitar Hero III | official wallpaper 4, Johnny Napalm + logo (2007) | Activision / RedOctane / Neversoft | `games/guitar-hero-3/gh3-official-wallpaper-4-johnny-napalm-logo-1280x1024.jpg` | full | <http://web.archive.org/web/20080507145120/http://www.guitarherogame.com/gh3/wallpapers/4-1280.jpg> |
| A1 | Avatar | "The Legend of Aang" international key art | Nickelodeon / Paramount (Viacom) | `shows-and-films/avatar-the-last-airbender/avatar-legend-of-aang-international-key-art.jpg` | full | <https://image.tmdb.org/t/p/original/tvIihCftN5TnQiD4tsMvDS7HsTE.jpg> |
| F3 | Green Day | American Idiot: The Tour 2005 promoter banner | Frontier Touring; band: Green Day | `music/green-day-american-idiot/green-day-american-idiot-tour-2005-promo-banner-959x520.jpg` | (0, 0, 1, 0.94) | <https://frontiertouring.com/files/web_images/675/merchant_675.jpeg> |
| B3 | SSX 3 | SSX 3 PS2 NA box front (2003) | Electronic Arts | `games/ssx-3/ssx3-ps2-na-box-front-scan-3040x4303.jpg` | (0.02, 0.125, 0.98, 0.83) | <https://gamesdb.launchbox-app.com/games/images/3560> |
| O1 | Oblivion | Oblivion US box art (2006) | Bethesda Softworks / ZeniMax Media | `shows-and-films/oblivion/oblivion-2006-box-art-us-pre-release.jpg` | (0, 0, 1, 0.73) | <https://images.uesp.net/1/19/OB-cover-Oblivion_Box_Art.jpg> |
| C4 | SSX 3 | Allegra by Adam Warren wallpaper (2003) | Electronic Arts; art by Adam Warren | `games/ssx-3/ssx3-official-wallpaper-allegra-adam-warren-1024x768.jpg` | full | <https://ssx.fandom.com/wiki/File:SSX3_s_ALLEGRA_by_AdamWarren.jpg> |
| C3 | Green Day | Holiday single cover (2005) | Green Day / Reprise Records | `music/green-day-american-idiot/green-day-holiday-single-cover.jpg` | full | <https://is1-ssl.mzstatic.com/image/thumb/Music/ce/e3/2d/mzi.xncbnqkn.jpg/4000x4000bb.jpg> |
| C7 | Radiohead | In Rainbows Disk 2 cover (Dec 2007) | Radiohead / XL Recordings; art by Stanley Donwood | `music/radiohead-in-rainbows/in-rainbows-disk-2-cover-1400.jpg` | full | <https://f4.bcbits.com/img/a3154171150_0.jpg> |
| C5 | Avatar | Book 1: Water key art | Nickelodeon / Paramount (Viacom) | `shows-and-films/avatar-the-last-airbender/avatar-tla-book-1-water-key-art-glider.jpg` | full | <https://image.tmdb.org/t/p/original/mU3K1vdXFfYpWmiEnmRXwUpGPLM.jpg> |
| C2 | RuneScape | Attack on Varrock wallpaper (Apr 2007) | Jagex | `games/runescape/wallpaper-Attack_on_Varrock_1920x1200.jpg` | full | <https://oldschool.runescape.wiki/w/File:Attack_on_Varrock_1920x1200.jpg> |
| C6 | LEGO Star Wars | LEGO Star Wars II: The Original Trilogy cover (2006) | The LEGO Group, TT Games, LucasArts / Lucasfilm | `shows-and-films/lego-star-wars/lego-star-wars-ii-original-trilogy-2006-cover-art.jpg` | (0, 0, 1, 0.78) | <https://web.archive.org/web/2024id_/https://static.wikia.nocookie.net/starwars/images/6/68/Legostarwars2.jpg/revision/latest?cb=20100414162107> |
| E1 | Call of Duty 4 | SAS gas-mask wallpaper (2007) | Activision / Infinity Ward | `games/call-of-duty-4/cod4-official-wallpaper-sas-gasmask-charlieoscardelta-1600x1200.jpg` | full | <https://callofduty.fandom.com/wiki/File:Wallpaper-cod4-2.jpg> |
| E2 | LEGO Star Wars | LEGO Star Wars: The Complete Saga cover (2007) | The LEGO Group, TT Games, LucasArts / Lucasfilm | `shows-and-films/lego-star-wars/lego-star-wars-complete-saga-2007-cover-art.jpg` | full | <https://web.archive.org/web/2024id_/https://static.wikia.nocookie.net/starwars/images/f/fc/LEGO_Star_Wars_TCS.jpg/revision/latest?cb=20180425151554> |
| G1 | Green Day | American Idiot cover (2004) | Green Day / Reprise Records | `music/green-day-american-idiot/green-day-american-idiot-album-cover.jpg` | full | <https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/0e/17/f0/0e17f011-aadf-d4d1-1c7e-b61ce39f968b/093624947301.jpg/4000x4000bb.jpg> |
| S1 | Star Wars | Star Wars 1977 Style A one-sheet | Lucasfilm; art by Tom Jung | `shows-and-films/star-wars/star-wars-1977-style-a-tom-jung.jpg` | full | <http://www.impawards.com/1977/posters/star_wars_ver2_xxlg.jpg> |
| S2 | Avatar | Book 2: Earth key art | Nickelodeon / Paramount (Viacom) | `shows-and-films/avatar-the-last-airbender/avatar-tla-book-2-earth-key-art-avatar-state.jpg` | full | <https://image.tmdb.org/t/p/original/Apo0IFtqh0rr6wx4NBBTgdlP0Su.jpg> |
| S3 | Star Wars | Revenge of the Sith teaser (2005) | Lucasfilm | `shows-and-films/star-wars/star-wars-episode-iii-2005-teaser-vader-shadow.jpg` | full | <http://www.impawards.com/2005/posters/star_wars_episode_three_xxlg.jpg> |
| S4 | Guitar Hero III | GH3 textless cover key art (2007) | Activision / RedOctane / Neversoft | `games/guitar-hero-3/gh3-cover-key-art-textless-slash-judy-lars-1920x1080.jpg` | full | <https://gamesdb.launchbox-app.com/games/images/7191> |
| S5 | Call of Duty 4 | CoD4 key art with logo (soundtrack cover) | Activision / Infinity Ward | `games/call-of-duty-4/cod4-key-art-soundtrack-cover-1275x1275.png` | (0, 0, 1, 0.92) | <https://callofduty.fandom.com/wiki/File:CoD4_Soundtrack_Cover_Art.png> |
| O2 | Oblivion | The Battle of Kvatch wallpaper (2006) | Bethesda Softworks / ZeniMax Media | `shows-and-films/oblivion/oblivion-2006-official-wallpaper-battle-of-kvatch-1600x1200.jpg` | (0.18, 0.12, 0.82, 1) | <https://images.uesp.net/4/46/OB-wallpaper-The_Battle_of_Kvatch-1600x1200.jpg> |
