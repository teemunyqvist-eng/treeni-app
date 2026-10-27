/**
 * Liikekirjasto – tekniikkavihjeet, hyödyt, virheet, videot
 * Videot: youtube-nocookie embed kun ID varmistettu; muuten ulkoinen linkki.
 */
(function (global) {
  'use strict';

  function ytEmbed(id) {
    return 'https://www.youtube-nocookie.com/embed/' + id;
  }
  function ytWatch(id) {
    return 'https://www.youtube.com/watch?v=' + id;
  }
  function ytSearch(q) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  }

  /** @type {Record<string, object>} */
  const EXERCISES = {
    // ---- Voima: sali ----
    back_squat: {
      id: 'back_squat',
      loadsShoulder: true,
      name: 'Takakyykky',
      category: 'voima',
      equipment: ['tanko', 'teline'],
      benefits: [
        'Kehittää jalkojen ja keskivartalon voimaa',
        'Parantaa juoksun taloudellisuutta ja mäki-/loppuvoimaa',
        'Tukee lonkan ja polven hallintaa rasituksessa'
      ],
      cues: [
        'Tanko yläselän trapseille (high-bar) tai hieman alemmas',
        'Rinta ylös, keskivartalo tiukkana',
        'Polvet varpaiden suuntaan, paino koko jalkapohjalla',
        'Syvyys vähintään vaakatasoon (reisi–lattia) jos liikkuvuus riittää',
        'Nouse hallitusti, älä pompi pohjasta'
      ],
      mistakes: [
        'Polvet romahtavat sisään',
        'Selkä pyöristyy tai kantapäät nousevat',
        'Liian nopea lasku ilman hallintaa'
      ],
      video: { type: 'embed', youtubeId: 'bEv6CCg2BC8', label: 'Jeff Nippard – squat technique' }
    },
    front_squat: {
      id: 'front_squat',
      loadsShoulder: true,
      name: 'Etukyykky',
      category: 'voima',
      equipment: ['tanko', 'teline'],
      benefits: [
        'Korostaa etureisiä ja pystympää asentoa',
        'Vahvistaa keskivartaloa etukuormalla',
        'Hyvä vaihtoehto takakyykylle maratoonarin voimatreenissä'
      ],
      cues: [
        'Tanko etuhartioilla, kyynärpäät korkealla',
        'Rinta ja kyynärpäät ylös koko liikkeen ajan',
        'Laske polvet eteen, torso mahdollisimman pystyssä',
        'Syvyys vähintään paralleeliin'
      ],
      mistakes: [
        'Kyynärpäät tippuvat → tanko valuu',
        'Liiallinen etukumara',
        'Kantapäät nousevat'
      ],
      video: { type: 'link', url: ytSearch('Jeff Nippard how to front squat'), label: 'Katso video (YouTube-haku)' }
    },
    goblet_squat: {
      id: 'goblet_squat',
      loadsShoulder: true,
      name: 'Goblet-kyykky',
      category: 'voima',
      equipment: ['käsipaino', 'kettlebell'],
      benefits: [
        'Helppo oppia, turvallinen kotona/salilla',
        'Oppiaa kyykkypatternin ennen raskasta tankoa',
        'Aktivoi jalkoja ja keskivartaloa kevyellä kuormalla'
      ],
      cues: [
        'Paino rinnan edessä, kyynärpäät alas reisien väliin',
        'Jalat hartioiden leveydellä, varpaat hieman ulos',
        'Istu taakse-alas, rinta pystyssä',
        'Paino koko jalkapohjalla'
      ],
      mistakes: [
        'Paino tippuu eteen ja selkä pyöristyy',
        'Polvet tippuvat sisään',
        'Liian kapea asento'
      ],
      video: { type: 'link', url: ytSearch('goblet squat form tutorial'), label: 'Katso video (YouTube-haku)' }
    },
    band_squat: {
      id: 'band_squat',
      loadsShoulder: true,
      name: 'Kuminauhakyykky',
      category: 'voima',
      equipment: ['kuminauha'],
      benefits: [
        'Vastus kasvaa ylöspäin – hyvä kotivaihtoehto',
        'Säilyttää kyykkykuorman ilman painoja',
        'Aktivoi pakarat nauhan sivuvastuksella'
      ],
      cues: [
        'Seiso nauhan päällä, kahvat hartioiden korkeudella tai niskan takana',
        'Sama kyykkypattern kuin gobletissa',
        'Pidä jännitys nauhassa koko ajan',
        'Hallittu tempo, erityisesti ylös'
      ],
      mistakes: [
        'Nauha lipsahtaa jalkojen alta',
        'Polvet tippuvat sisään',
        'Lyhyt liikerata'
      ],
      video: { type: 'link', url: ytSearch('band squat form resistance band'), label: 'Katso video (YouTube-haku)' }
    },
    deadlift: {
      id: 'deadlift',
      loadsShoulder: true,
      name: 'Maastaveto',
      category: 'voima',
      equipment: ['tanko'],
      benefits: [
        'Vahvistaa takaketjua (pakarat, takareidet, selkä)',
        'Siirtyy juoksun voimantuottoon ja ryhtiin',
        'Rakentaa yleistä maksimivoimaa'
      ],
      cues: [
        'Tanko keskijalan päällä, säärret tankoa vasten',
        'Ota ote → polvet tankoon → rinta ylös, selkä neutraali',
        'Vedä tanko pitkin säärtä/reittä ylös',
        'Lukitse lonkat ylhäällä ilman yliojentamista',
        'Laske hallitusti samaa reittiä'
      ],
      mistakes: [
        'Selkä pyöristyy nostossa',
        'Tanko irtoaa kehosta (liian kauas)',
        'Nykäisy selällä ilman jalkatyötä'
      ],
      video: { type: 'embed', youtubeId: 'p2OPUi4xGrM', label: 'Starting Strength – deadlift' }
    },
    rdl: {
      id: 'rdl',
      loadsShoulder: true,
      name: 'Romanian maastaveto',
      category: 'voima',
      equipment: ['tanko'],
      benefits: [
        'Kohdistaa takareisiin ja pakaroihin',
        'Opettaa lonkkasaranan (hip hinge) – kriittinen juoksijalle',
        'Vahvistaa alaselän isometristä hallintaa'
      ],
      cues: [
        'Lievä polvikulma, työnnä lonkat taakse',
        'Tanko kiinni reisissä koko ajan',
        'Selkä neutraali, rinta auki',
        'Laske kunnes tuntuu takareisissä (yleensä polven alle)',
        'Nouse lonkilla eteen, älä nykäise selällä'
      ],
      mistakes: [
        'Polvet koukistuvat liikaa (muuttuu kyykyksi)',
        'Selän pyöristyminen',
        'Tanko irtoaa kehosta'
      ],
      video: { type: 'embed', youtubeId: '_oyxCn2iSjU', label: 'Jeff Nippard – RDL' }
    },
    rdl_db: {
      id: 'rdl_db',
      loadsShoulder: true,
      name: 'Romanian maastaveto (käsipainot)',
      category: 'voima',
      equipment: ['käsipainot', 'kuminauha'],
      benefits: [
        'Sama hip hinge kotona kevyillä painoilla',
        'Hyvä takaketjun aktivointi ennen juoksua',
        'Tempoa hidastamalla kuormitus riittää ≤10 kg painoilla'
      ],
      cues: [
        'Painot reisien edessä, lievä polvikulma',
        'Lonkat taakse, selkä neutraali',
        'Hidasta tempoa (esim. 3 s alas)',
        'Tunne venytys takareisissä ennen nousua'
      ],
      mistakes: [
        'Pyöreä selkä',
        'Painot kaukana kehosta',
        'Liian nopea tempo ilman jännitystä'
      ],
      video: { type: 'embed', youtubeId: '_oyxCn2iSjU', label: 'Jeff Nippard – RDL (sovella käsipainoilla)' }
    },
    bench_press: {
      id: 'bench_press',
      loadsShoulder: true,
      name: 'Penkkipunnerrus',
      category: 'voima',
      equipment: ['tanko', 'käsipainot', 'penkki'],
      benefits: [
        'Rintakehän, olkapäiden ja ojentajien voima',
        'Ylävartalon työntövoima (juoksuasennon tuki)',
        'Tasapainottaa vetoliikkeitä'
      ],
      cues: [
        'Lapaluut taakse ja alas, jalat tukevasti maassa',
        'Ote leveämpi kuin hartiat, rannet suorina',
        'Laske tanko rinnan ala-/keskiosaan hallitusti',
        'Kyynärpäät noin 45–70° vartalosta',
        'Työnnä ylös hieman kaarevasti kohti telineitä'
      ],
      mistakes: [
        'Kyynärpäät 90° sivuille (olkapääkuorma)',
        'Pakarat irti penkistä',
        'Pomppu rinnasta'
      ],
      video: { type: 'embed', youtubeId: 'vcBig73ojpE', label: 'Jeff Nippard – bench press' }
    },
    incline_bench: {
      id: 'incline_bench',
      loadsShoulder: true,
      name: 'Vinopenkki',
      category: 'voima',
      equipment: ['tanko', 'käsipainot', 'penkki'],
      benefits: [
        'Korostaa ylärautaa ja olkapäitä',
        'Vaihtelu tasaiseen penkkiin',
        'Hyvä työntövoiman kehittäjä'
      ],
      cues: [
        'Penkki 15–45° kulmaan',
        'Sama lapaluu- ja jalkatuki kuin penkissä',
        'Laske rinnan yläosaan',
        'Hallittu tempo, täysi lukitus ylös'
      ],
      mistakes: [
        'Liian jyrkkä kulma → muuttuu pystypunnerrukseksi',
        'Kyynärpäät liian auki',
        'Lyhyt liikerata'
      ],
      video: { type: 'link', url: ytSearch('incline bench press form Jeff Nippard'), label: 'Katso video (YouTube-haku)' }
    },
    cable_chest_press: {
      id: 'cable_chest_press',
      loadsShoulder: true,
      name: 'Kaapelipunnerrus',
      category: 'voima',
      equipment: ['kaapeli'],
      benefits: [
        'Tasainen vastus koko liikeradalla',
        'Olkapääystävällisempi vaihtoehto penkille',
        'Hyvä työntövoima kaapeliasemalla'
      ],
      cues: [
        'Kahvat rinnan korkeudella, askel eteen',
        'Työnnä eteen, kyynärpäät hieman koukussa lukituksessa',
        'Lapaluut hallinnassa, ei eteenkaatumista',
        'Palauta hallitusti'
      ],
      mistakes: [
        'Liikaa vauhtia ja heilahtelua',
        'Hartiat nousevat korviin',
        'Selkä notkolla ilman tukea'
      ],
      video: { type: 'link', url: ytSearch('cable chest press form'), label: 'Katso video (YouTube-haku)' }
    },
    floor_press: {
      id: 'floor_press',
      loadsShoulder: true,
      name: 'Lattia-/korokepunnerrus',
      category: 'voima',
      equipment: ['käsipainot', 'step-lauta'],
      benefits: [
        'Turvallinen työntö kotona ilman penkkiä',
        'Rajoitettu liikerata säästää olkapäitä',
        'Toimii ≤10 kg painoilla + hidas tempo'
      ],
      cues: [
        'Makaa lattialla/stepillä, painot rinnan yllä',
        'Laske kunnes olkavarret koskettavat lattiaa',
        'Tauko hetki → työnnä ylös',
        'Lapaluut taakse, rannet suorina'
      ],
      mistakes: [
        'Kyynärpäät liian auki',
        'Pomppu lattiasta',
        'Ranteet taittuvat'
      ],
      video: { type: 'link', url: ytSearch('dumbbell floor press form'), label: 'Katso video (YouTube-haku)' }
    },
    band_press: {
      id: 'band_press',
      loadsShoulder: true,
      name: 'Kuminauhapunnerrus',
      category: 'voima',
      equipment: ['kuminauha'],
      benefits: [
        'Kotityöntö ilman painoja',
        'Vastus kasvaa lopussa',
        'Hyvä olkapääystävällinen vaihtoehto'
      ],
      cues: [
        'Nauha selän takana tai ankkuroitu',
        'Työnnä eteen rinnan korkeudelta',
        'Hallittu palautus',
        'Pidä keskivartalo tiukkana'
      ],
      mistakes: [
        'Nauha liian löysä / liian kireä',
        'Hartiat eteen',
        'Vain osittainen liikerata'
      ],
      video: { type: 'link', url: ytSearch('resistance band chest press form'), label: 'Katso video (YouTube-haku)' }
    },
    overhead_press: {
      id: 'overhead_press',
      loadsShoulder: true,
      name: 'Pystypunnerrus',
      category: 'voima',
      equipment: ['käsipainot', 'kuminauha', 'tanko'],
      benefits: [
        'Olkapäiden ja ojentajien voima',
        'Ylävartalon pystytuki juoksuasennossa',
        'Koko kehon jännitys (core)'
      ],
      cues: [
        'Painot hartioiden korkeudella, kyynärpäät hieman eteen',
        'Purista pakarat ja vatsa',
        'Työnnä ylös suoraan, pää väistää taakse tarvittaessa',
        'Laske hallitusti hartioille'
      ],
      mistakes: [
        'Liiallinen notko alaselässä',
        'Painot liian edessä',
        'Osittainen lukitus'
      ],
      video: { type: 'link', url: ytSearch('dumbbell overhead press form'), label: 'Katso video (YouTube-haku)' }
    },
    lat_pulldown: {
      id: 'lat_pulldown',
      loadsShoulder: true,
      name: 'Ylätalja',
      category: 'voima',
      equipment: ['kaapeli', 'talja'],
      benefits: [
        'Leveän selän ja ylävedon voima',
        'Tasapainottaa työntöliikkeitä',
        'Tukee ryhtiä juoksussa'
      ],
      cues: [
        'Ote hieman hartioita leveämpi',
        'Vedä rintaan, kyynärpäät alas ja taakse',
        'Rinta ylös, älä nojaa liikaa taakse',
        'Hallittu palautus ylös'
      ],
      mistakes: [
        'Heilahdus vartalolla',
        'Veto niskan taakse',
        'Liian lyhyt liikerata'
      ],
      video: { type: 'link', url: ytSearch('lat pulldown proper form'), label: 'Katso video (YouTube-haku)' }
    },
    seated_cable_row: {
      id: 'seated_cable_row',
      loadsShoulder: true,
      name: 'Istuva kaapelisoutu / alatalja',
      category: 'voima',
      equipment: ['kaapeli'],
      benefits: [
        'Keskiselän ja latsien voima',
        'Parantaa ryhtiä ja lapaluun hallintaa',
        'Vastapaino penkille/punnerrukselle'
      ],
      cues: [
        'Istu tukevasti, rinta auki',
        'Vedä kahva napaan/vatsaan, kyynärpäät taakse',
        'Purista lapaluut yhteen lopussa',
        'Älä heilahtele vartalolla'
      ],
      mistakes: [
        'Pyöreä selkä vedossa',
        'Liikaa heiluriliikettä',
        'Hartiat nousevat'
      ],
      video: { type: 'link', url: ytSearch('seated cable row form'), label: 'Katso video (YouTube-haku)' }
    },
    bent_over_row: {
      id: 'bent_over_row',
      loadsShoulder: true,
      name: 'Kulmasoutu',
      category: 'voima',
      equipment: ['tanko', 'käsipainot'],
      benefits: [
        'Vahva selän vetoliike vapailla painoilla',
        'Rakentaa yläselän voimaa juoksuasentoon',
        'Hyvä koko kehon jännitys'
      ],
      cues: [
        'Lonkat taakse, torso ~45°',
        'Vedä tanko/painot alavatsaan',
        'Kyynärpäät läheltä kylkiä',
        'Selkä neutraali koko ajan'
      ],
      mistakes: [
        'Selkä pyöristyy',
        'Veto liian korkealle rintaan',
        'Momentumilla nykäisy'
      ],
      video: { type: 'link', url: ytSearch('barbell bent over row form'), label: 'Katso video (YouTube-haku)' }
    },
    pullup: {
      id: 'pullup',
      loadsShoulder: true,
      name: 'Leuanveto',
      category: 'voima',
      equipment: ['leuanvetotanko'],
      benefits: [
        'Ylävartalon veto- ja keskivartalon voima',
        'Parantaa ryhtiä ja hartiarengasta',
        'Tehokas kehonpainoliike kotona'
      ],
      cues: [
        'Ote hartioiden leveydellä, aktivoi lapaluut ensin',
        'Vedä rintakeää kohti tankoa',
        'Kyynärpäät alas, ei vain käsivarsilla',
        'Laske hallitusti lähes suorille käsille'
      ],
      mistakes: [
        'Heilahdus ja kipping ilman hallintaa',
        'Puolikkaat toistot',
        'Hartiat korvissa ilman lapaluuaktivaatiota'
      ],
      video: { type: 'link', url: ytSearch('how to do a pull up Athlean-X'), label: 'Katso video (YouTube-haku)' }
    },
    push_up: {
      id: 'push_up',
      loadsShoulder: true,
      name: 'Punnerrus',
      category: 'voima',
      equipment: ['kehonpaino'],
      benefits: [
        'Ylävartalon työntövoima ilman välineitä',
        'Hartiarengas ja keskivartalo yhdessä',
        'Helppo edetä toistoissa (baseline ~30–35)'
      ],
      cues: [
        'Kädet hieman hartioita leveämmällä, rinta kohti lattiaa',
        'Vartalo suorana päästä kantapäihin',
        'Kyynärpäät ~45° vartalosta, ei leviä sivuille',
        'Täysi liikerata: rinta lähes lattiaan → suoriksi käsiksi'
      ],
      mistakes: [
        'Lantio notkolla tai pystyssä',
        'Puolikkaat toistot',
        'Hartiat korvissa / niska jännittynyt'
      ],
      video: { type: 'link', url: ytSearch('perfect push up form tutorial'), label: 'Katso video (YouTube-haku)' }
    },
    scap_pull: {
      id: 'scap_pull',
      loadsShoulder: true,

      name: 'Scapular pull (lapaluuveto)',
      category: 'voima',
      equipment: ['leuanvetotanko'],
      benefits: [
        'Oppii lapaluun aktivaation ennen leuanvetoja',
        'Vahvistaa hartiarengasta',
        'Hyvä aloitus jos leuanveto ei vielä onnistu'
      ],
      cues: [
        'Ripustu suorille käsille',
        'Vedä lapaluut alas ja yhteen ilman kyynärkoukistusta',
        'Pidä 1–2 s → rentouta hallitusti',
        'Rinta auki, niska rentona'
      ],
      mistakes: [
        'Kyynärpäiden koukistus (muuttuu leuanvedoksi)',
        'Heiluminen',
        'Hartiat jäävät korviin'
      ],
      video: { type: 'link', url: ytSearch('scapular pull up tutorial'), label: 'Katso video (YouTube-haku)' }
    },
    band_assisted_pullup: {
      id: 'band_assisted_pullup',
      loadsShoulder: true,
      name: 'Kuminauha-avusteinen leuanveto',
      category: 'voima',
      equipment: ['leuanvetotanko', 'kuminauha'],
      benefits: [
        'Mahdollistaa täyden liikeradan ennen omaa leuanvetoa',
        'Rakentaa vetoa progressiivisesti',
        'Säilyttää oikean liikemallin'
      ],
      cues: [
        'Nauha tankoon, polvi/jalka lenkkiin',
        'Sama tekniikka kuin leuanvedossa',
        'Kontrolloi lasku – älä putoa nauhan varaan',
        'Vähennä avustusta ajan myötä'
      ],
      mistakes: [
        'Liian paksu nauha → ei kehitystä',
        'Heilahdus',
        'Osittaiset toistot'
      ],
      video: { type: 'link', url: ytSearch('band assisted pull up form'), label: 'Katso video (YouTube-haku)' }
    },
    band_row: {
      id: 'band_row',
      loadsShoulder: true,
      name: 'Kuminauhasoutu',
      category: 'voima',
      equipment: ['kuminauha'],
      benefits: [
        'Kotiveto ilman taljaa',
        'Parantaa ryhtiä ja yläselän voimaa',
        'Helppo säätää vastusta'
      ],
      cues: [
        'Ankkuroi nauha (ovi/tolppa) rinnan korkeudelle',
        'Vedä kyynärpäät taakse, lapaluut yhteen',
        'Rinta auki, torso paikallaan',
        'Hidasta palautusta'
      ],
      mistakes: [
        'Heilahdus vartalolla',
        'Hartiat nousevat',
        'Liian lyhyt veto'
      ],
      video: { type: 'link', url: ytSearch('resistance band row form'), label: 'Katso video (YouTube-haku)' }
    },
    inverted_row: {
      id: 'inverted_row',
      loadsShoulder: true,
      name: 'Inverted row (kulmasoutu tangolla)',
      category: 'voima',
      equipment: ['leuanvetotanko', 'tanko'],
      benefits: [
        'Kehonpainoveto vaakatasossa',
        'Hyvä silta leuanvetoon',
        'Vahvistaa yläselkää ja corea'
      ],
      cues: [
        'Tangon alle, vartalo suorana viivana',
        'Vedä rinta tankoon',
        'Purista lapaluut, laske hallitusti',
        'Helpota jalkoja koukistamalla / vaikeuta suoristamalla'
      ],
      mistakes: [
        'Lantio tippuu (ei suoraa linjaa)',
        'Vain kaulan nosto',
        'Liian korkea tanko → liian helppo'
      ],
      video: { type: 'link', url: ytSearch('inverted row form tutorial'), label: 'Katso video (YouTube-haku)' }
    },
    plank: {
      id: 'plank',
      loadsShoulder: true,
      name: 'Lankku',
      category: 'voima',
      equipment: [],
      benefits: [
        'Keskivartalon kestävyys ja ryhti',
        'Siirtyy juoksun vartalonhallintaan',
        'Yksinkertainen, ei välineitä'
      ],
      cues: [
        'Kyynärpäät hartioiden alla',
        'Vartalo suorana: pää–lonkat–nilkat',
        'Purista vatsa ja pakarat, älä notkista',
        'Hengitä rauhallisesti, pidä aika laadukkaana'
      ],
      mistakes: [
        'Lantio tippuu tai nousee liikaa',
        'Pää roikkuu',
        'Pidä niin kauan että muoto romahtaa'
      ],
      video: { type: 'embed', youtubeId: 'xVrALzPc7dM', label: 'ATHLEAN-X – plank progression' }
    },
    ab_wheel: {
      id: 'ab_wheel',
      loadsShoulder: true,
      name: 'Ab wheel -rullaus',
      category: 'voima',
      equipment: ['ab wheel'],
      benefits: [
        'Vahva anteriorinen core (anti-extension)',
        'Parantaa juoksun vartalon vakautta',
        'Progressiivinen: polvilta → varpailta'
      ],
      cues: [
        'Aloita polvilta tarvittaessa',
        'Rullaa eteen hallitusti, lantio ei tipu',
        'Pidä vatsa tiukkana koko ajan',
        'Palaa samalla kontrollilla'
      ],
      mistakes: [
        'Alaselkä notkahtaa (vaarallinen)',
        'Liian pitkä rullaus liian aikaisin',
        'Hengityksen pidättäminen paniikissa'
      ],
      video: { type: 'link', url: ytSearch('ab wheel rollout form Athlean-X'), label: 'Katso video (YouTube-haku)' }
    },
    dead_bug: {
      id: 'dead_bug',
      name: 'Dead bug',
      category: 'voima',
      equipment: [],
      benefits: [
        'Opettaa corea ilman selkäkuormaa',
        'Parantaa raajojen ja vartalon yhteistyötä',
        'Hyvä vaihtoehto/täydennys lankulle'
      ],
      cues: [
        'Selinmakuu, alaselkä kevyesti lattiassa',
        'Vastakkainen käsi+jalka ojentuu hallitusti',
        'Älä anna selän notkahtaa',
        'Hengitä ulos ojennuksessa'
      ],
      mistakes: [
        'Alaselkä nousee kaarelle',
        'Liian nopea liike',
        'Pidätetty hengitys'
      ],
      video: { type: 'link', url: ytSearch('dead bug exercise form'), label: 'Katso video (YouTube-haku)' }
    },
    ball_rollout: {
      id: 'ball_rollout',
      loadsShoulder: true,
      name: 'Pallorullaus',
      category: 'voima',
      equipment: ['jumppapallo'],
      benefits: [
        'Samanlainen anti-extension kuin ab wheel',
        'Keskivartalon hallinta',
        'Vaihtoehto ab wheelille salilla'
      ],
      cues: [
        'Kyynärvarret tai kädet pallolla',
        'Rullaa eteen hallitusti, lantio vakaana',
        'Palaa kontrollilla',
        'Pidä niska neutraalina'
      ],
      mistakes: [
        'Lantio tippuu',
        'Liian pitkä rullaus',
        'Hartiat nousevat korviin'
      ],
      video: { type: 'link', url: ytSearch('stability ball rollout form'), label: 'Katso video (YouTube-haku)' }
    },
    lunge: {
      id: 'lunge',
      name: 'Askelkyykky',
      category: 'voima',
      equipment: ['käsipainot', 'step-lauta'],
      benefits: [
        'Yhden jalan voima ja tasapaino',
        'Korjaa puolieroja juoksussa',
        'Vahvistaa pakaroita ja etureisiä'
      ],
      cues: [
        'Askel taakse tai stepille, etupolvi ~nilkan päällä',
        'Rinta pystyssä, etureisi ja takareisi ~90°',
        'Työnnä etujalalla ylös',
        'Tee molemmat puolet'
      ],
      mistakes: [
        'Etupolvi romahtaa sisään',
        'Liian lyhyt askel',
        'Eteentaipuminen'
      ],
      video: { type: 'link', url: ytSearch('dumbbell reverse lunge form'), label: 'Katso video (YouTube-haku)' }
    },
    single_leg_hip_thrust: {
      id: 'single_leg_hip_thrust',
      name: 'Yhden jalan lantionnosto',
      category: 'voima',
      equipment: ['step-lauta'],
      benefits: [
        'Pakaran eristävä voima juoksijalle',
        'Parantaa lantion vakautta',
        'Vähentää tyypillisiä juoksijan heikkouksia'
      ],
      cues: [
        'Yläselkä stepillä, yksi jalka maassa',
        'Työnnä lonkka ylös pakaralla',
        'Pidä 1 s ylhäällä, laske hallitusti',
        'Lantio suorassa, ei kallistusta'
      ],
      mistakes: [
        'Työntö alaselällä pakaran sijaan',
        'Lantion kallistus sivulle',
        'Liian lyhyt liikerata'
      ],
      video: { type: 'link', url: ytSearch('single leg hip thrust form'), label: 'Katso video (YouTube-haku)' }
    },
    calf_raise: {
      id: 'calf_raise',
      name: 'Pohjenosto',
      category: 'voima',
      equipment: ['step-lauta'],
      benefits: [
        'Pohkeiden voima ja jänteiden kestävyys',
        'Tukee juoksun ponnistusvaihetta',
        'Auttaa akilles-/pohjekestävyydessä'
      ],
      cues: [
        'Päkiät stepillä, kannat vapaana',
        'Nouse täyteen ojennukseen',
        'Laske hallitusti venytykseen',
        'Pidä polvet pehmeinä, ei lukittuna'
      ],
      mistakes: [
        'Pomppu ilman täyttä liikettä',
        'Liian nopea tempo',
        'Vain osittainen ylös-/alasvaihe'
      ],
      video: { type: 'link', url: ytSearch('standing calf raise form step'), label: 'Katso video (YouTube-haku)' }
    },

    // ---- Lämmittely / liikkuvuus / venyttely ----
    light_jog: {
      id: 'light_jog',
      name: 'Kevyt hölkkä / askellus',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Nostaa kehon lämpötilaa ja sykettä turvallisesti',
        'Valmistaa nivelet ja lihakset juoksuun tai voimaan',
        'Vähentää jäykkyyden tuntua treenin alussa'
      ],
      cues: [
        'Helppo tempo – hengitys rauhallinen',
        '2–5 min riittää yleensä',
        'Paikallaan askellus / polvennostot ok sisätiloissa',
        'Hartiat rentoina, älä jännitä niskoja'
      ],
      mistakes: [
        'Aloittaa liian kovalla vauhdilla',
        'Hyppii räjähtävästi ennen lämmittelyä',
        'Ohittaa kokonaan kylmänä'
      ],
      video: { type: 'link', url: ytSearch('easy jog warm up routine'), label: 'Katso video (YouTube-haku)' }
    },
    leg_swings: {
      id: 'leg_swings',
      name: 'Jalanheilautukset',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Avaa lonkkaa dynaamisesti juoksuun',
        'Aktivoi lonkankoukistajia ja takaketjua',
        'Parantaa askelpituuden tuntumaa ilman staattista venytystä'
      ],
      cues: [
        'Tukeudu seinään/tolppaan tarvittaessa',
        'Heilauta jalkaa eteen–taakse hallitusti',
        'Pidä lantio vakaana – älä heilu sivulle',
        '10–12 heilautusta / puoli; sitten sivuttaisheilautukset'
      ],
      mistakes: [
        'Liian iso heilautus ilman kontrollia',
        'Kiertää vartaloa mukana',
        'Lukitsee polven jäykäksi'
      ],
      video: { type: 'link', url: ytSearch('leg swings dynamic warm up running'), label: 'Katso video (YouTube-haku)' }
    },
    hip_opener: {
      id: 'hip_opener',
      name: 'Lonkan avaukset',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Lisää lonkan liikkuvuutta juoksuun ja kyykkyyn',
        'Vähentää jäykkyyttä lantion alueella',
        'Valmistaa pakaroita ja lonkankoukistajia'
      ],
      cues: [
        'Seisten tai nelinkontin: avaa lonkkaa hallitusti',
        'Esim. 90/90-istunta tai polven ympyrät',
        'Hengitä rauhallisesti, älä pakota ääriasentoa',
        '8–10 toistoa / puoli'
      ],
      mistakes: [
        'Pakottaa kipuun asti',
        'Pyöristää alaselkää voimakkaasti',
        'Pidättää hengitystä'
      ],
      video: { type: 'link', url: ytSearch('hip openers warm up mobility'), label: 'Katso video (YouTube-haku)' }
    },
    worlds_greatest_stretch: {
      id: 'worlds_greatest_stretch',
      loadsShoulder: true,
      name: "World's greatest stretch",
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Yhdistää lonkan, rintarangan ja takaketjun avauksen',
        'Erinomainen yleislämmittely juoksuun ja voimaan',
        'Parantaa kiertoliikkuvuutta'
      ],
      cues: [
        'Askel eteen syvään askelkyykkyyn, takapolvi matalalla',
        'Sama-puolen käsi maahan sisäreiden viereen',
        'Kierrä vapaa käsi kohti kattoa, katse seuraa',
        'Vaihda puolta; 3–5 / puoli'
      ],
      mistakes: [
        'Etupolvi tippuu sisään',
        'Kierto tulee vain hartioista, ei rintarangasta',
        'Liian nopea tempo ilman hallintaa'
      ],
      video: { type: 'link', url: ytSearch("world's greatest stretch mobility"), label: 'Katso video (YouTube-haku)' }
    },
    ankle_mobility: {
      id: 'ankle_mobility',
      name: 'Nilkan liikkuvuus',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Parantaa kyykyn ja juoksun nilkan dorsifleksiota',
        'Vähentää kompensaatiota polvissa ja lonkissa',
        'Tukee askelkontaktia'
      ],
      cues: [
        'Polvi seinää kohti varpaiden yli (seinätesti-tyyli)',
        'Kantapää pysyy maassa',
        'Tee myös nilkan ympyröitä molempiin suuntiin',
        '8–10 / puoli'
      ],
      mistakes: [
        'Kantapää nousee seinästä',
        'Polvi tippuu sisään',
        'Liian aggressiivinen paine'
      ],
      video: { type: 'link', url: ytSearch('ankle mobility dorsiflexion drill'), label: 'Katso video (YouTube-haku)' }
    },
    thoracic_opener: {
      id: 'thoracic_opener',
      loadsShoulder: true,
      name: 'Rintarangan avaukset',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Avaa yläselän kiertoa ja ojentumista',
        'Parantaa juoksuasentoa ja punnerrusten liikkuvuutta',
        'Vähentää “kytkettyä” hartiatuntumaa'
      ],
      cues: [
        'Nelinkontin tai kyljellään: kierrä käsivarsi auki',
        'Hengitä ulos avauksessa',
        'Pidä lantio vakaana – liike tulee rintakeäästä',
        '6–8 / puoli'
      ],
      mistakes: [
        'Kiertää lonkkaa mukana',
        'Pakottaa niskan taakse',
        'Liian nopea heilunta'
      ],
      video: { type: 'link', url: ytSearch('thoracic spine mobility opener open book'), label: 'Katso video (YouTube-haku)' }
    },
    arm_circles: {
      id: 'arm_circles',
      loadsShoulder: true,
      name: 'Käsien pyöritykset',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Lämmittää hartiat ja ylävartalon voimatreeniin',
        'Lisää olkanivelen liikkuvuuden tuntumaa',
        'Nopea aktivointi ilman välineitä'
      ],
      cues: [
        'Isot ja pienet ympyrät molempiin suuntiin',
        'Hartiat alas, ei nouse korviin',
        '10–15 / suunta',
        'Voi yhdistää kevyeen band pull-apartiin'
      ],
      mistakes: [
        'Hartiat nousevat ja jännittyvät',
        'Liian nopea heilunta kontrollitta',
        'Kipu olkapäässä – pienennä liikettä'
      ],
      video: { type: 'link', url: ytSearch('arm circles warm up shoulders'), label: 'Katso video (YouTube-haku)' }
    },
    bw_squat_warmup: {
      id: 'bw_squat_warmup',
      name: 'Kehonpainokyykky (lämmittely)',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Aktivoi kyykkypatternin ennen kuormaa',
        'Lämmittää jalat ja lonkat',
        'Tarkistaa liikkuvuuden ennen sali-/kotivoimaa'
      ],
      cues: [
        'Rinta ylös, paino koko jalkapohjalla',
        '8–12 hallittua toistoa',
        'Syvyys oman liikkuvuuden mukaan',
        'Ei painoa – vain aktivointi'
      ],
      mistakes: [
        'Polvet tippuvat sisään',
        'Kantapäät nousevat',
        'Kiirehtii raskaaseen tankoon ilman tätä'
      ],
      video: { type: 'link', url: ytSearch('bodyweight squat warm up form'), label: 'Katso video (YouTube-haku)' }
    },
    glute_activation: {
      id: 'glute_activation',
      name: 'Pakara-aktivointi',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Herättelee pakarat ennen juoksua/voimaa',
        'Tukee lonkan hallintaa',
        'Vähentää alaselän kompensaatiota'
      ],
      cues: [
        'Lantionnosto selinmakuulla TAI side-lying clam',
        'Purista pakarat ylhäällä 1–2 s',
        '10–12 toistoa',
        'Tunne pakaroissa – ei alaselässä'
      ],
      mistakes: [
        'Työntää alaselällä',
        'Liian nopea tempo',
        'Ei tunne pakaroita ollenkaan'
      ],
      video: { type: 'link', url: ytSearch('glute activation bridge warm up'), label: 'Katso video (YouTube-haku)' }
    },
    cat_cow: {
      id: 'cat_cow',
      loadsShoulder: true,
      name: 'Kissa–lehmä',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Pehmeä selän liikkuvuus ja hermoston rauhoitus',
        'Hyvä lepo-/sairaspäivän liikkuvuuteen',
        'Valmistaa rintarankaa ja lantiota'
      ],
      cues: [
        'Nelinkontin: vuorottele pyöristys ja notko',
        'Hengitä rytmissä liikkeen kanssa',
        '8–12 hidasta toistoa',
        'Pysy kivuttomalla alueella'
      ],
      mistakes: [
        'Liian nopea heilunta',
        'Pakottaa ääriasentoja',
        'Jännittää niskan'
      ],
      video: { type: 'link', url: ytSearch('cat cow stretch mobility'), label: 'Katso video (YouTube-haku)' }
    },
    calf_stretch: {
      id: 'calf_stretch',
      name: 'Pohjevenytys',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Palauttaa pohkeita juoksun jälkeen',
        'Tukee akilles-/nilkan joustavuutta',
        'Auttaa vähentämään jäykkyyttä seuraavana päivänä'
      ],
      cues: [
        'Seinää vasten: takajalka suorana (gastroc) ja polvi koukussa (soleus)',
        'Pidä 20–30 s / asento / puoli',
        'Kantapää maassa, lantio eteen',
        'Hengitä rauhallisesti – ei pompita'
      ],
      mistakes: [
        'Pomppiva “venytys”',
        'Kantapää nousee',
        'Venyttää kylmänä ennen juoksua pitkään staattisesti'
      ],
      video: { type: 'link', url: ytSearch('calf stretch wall gastroc soleus'), label: 'Katso video (YouTube-haku)' }
    },
    hip_flexor_stretch: {
      id: 'hip_flexor_stretch',
      name: 'Lonkan koukistajan venytys',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Avaa istumisen ja juoksun kiristämiä lonkankoukistajia',
        'Tukee lantion asentoa ja juoksuasentoa',
        'Hyvä cooldown pitkän lenkin jälkeen'
      ],
      cues: [
        'Polviseisominen: takapolvi maassa, etujalka 90°',
        'Työnnä lantiota kevyesti eteen, torso pystyssä',
        '20–40 s / puoli',
        'Voit nostaa samanpuoleisen käden ylös lisävenytykseen'
      ],
      mistakes: [
        'Notkistaa alaselkää voimakkaasti',
        'Etupolvi menee liian eteen',
        'Pidättää hengitystä'
      ],
      video: { type: 'link', url: ytSearch('hip flexor stretch kneeling'), label: 'Katso video (YouTube-haku)' }
    },
    hamstring_stretch: {
      id: 'hamstring_stretch',
      name: 'Takareiden venytys',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Vähentää takaketjun jäykkyyttä juoksun jälkeen',
        'Tukee lonkkasaranan tuntumaa',
        'Auttaa palautumisessa'
      ],
      cues: [
        'Seisten tai selinmakuulla hihnalla/pyyhkeellä',
        'Pidä selkä neutraalina – älä pyöristä voimakkaasti',
        '20–30 s / puoli',
        'Kevyt jännitys ok, kipu ei'
      ],
      mistakes: [
        'Pyöristää selän kasaan',
        'Nykäisee venytykseen',
        'Venyttää liian aggressiivisesti heti treenin jälkeen'
      ],
      video: { type: 'link', url: ytSearch('hamstring stretch lying strap'), label: 'Katso video (YouTube-haku)' }
    },
    quad_stretch: {
      id: 'quad_stretch',
      name: 'Etureiden venytys',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Avaa etureittä ja lonkankoukistajaa',
        'Hyvä juoksun ja kyykkypainotteisen voiman jälkeen',
        'Tukee polven tuntumaa'
      ],
      cues: [
        'Seisten: vedä kantapää kohti pakaraa',
        'Polvet vierekkäin, lantio kevyesti taakse',
        '20–30 s / puoli',
        'Tukeudu seinään tasapainon vuoksi'
      ],
      mistakes: [
        'Selkä notkolla liikaa',
        'Vääntää polvea sivulle',
        'Vetää liian kovaa'
      ],
      video: { type: 'link', url: ytSearch('standing quad stretch form'), label: 'Katso video (YouTube-haku)' }
    },
    figure4_stretch: {
      id: 'figure4_stretch',
      name: 'Figure-4 / piriformis-venytys',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Avaa pakaraa ja syviä lonkan ulkokiertäjiä',
        'Helpottaa “kireää pakaraa” juoksun jälkeen',
        'Hyvä vapaaehtoinen cooldown'
      ],
      cues: [
        'Selinmakuulla: nilkka vastakkaisen polven päälle',
        'Vedä reittä kevyesti kohti rintaa',
        '20–40 s / puoli',
        'Pidä lantio tasaisena'
      ],
      mistakes: [
        'Vääntää polvea sivulle kivuliaasti',
        'Nostaa päätä ja jännittää niskaa',
        'Venyttää liian lyhyen aikaa toistuvasti nykäisten'
      ],
      video: { type: 'link', url: ytSearch('figure 4 piriformis stretch'), label: 'Katso video (YouTube-haku)' }
    },
    childs_pose: {
      id: 'childs_pose',
      loadsShoulder: true,
      name: 'Lapsen asento',
      category: 'liikkuvuus',
      equipment: [],
      benefits: [
        'Rauhoittaa hermostoa lepo-/sairaspäivänä',
        'Pehmeä selän ja lonkan avaus',
        'Hyvä lopetus kevyelle liikkuvuudelle'
      ],
      cues: [
        'Istu kantapäille, kädet eteen, otsa matolle',
        'Hengitä syvään kylkiin',
        '30–60 s',
        'Levitä polvia tarvittaessa mukavuuden mukaan'
      ],
      mistakes: [
        'Pakottaa polvia jos ne kipeytyvät',
        'Pidättää hengitystä',
        'Jännittää hartiat korviin'
      ],
      video: { type: 'link', url: ytSearch("child's pose stretch yoga"), label: 'Katso video (YouTube-haku)' }
    },

    // ---- Juoksu ----
    easy_run_form: {
      id: 'easy_run_form',
      name: 'Helppo juoksuasento',
      category: 'juoksu',
      equipment: [],
      benefits: [
        'Rakentaa aerobista pohjaa maratonille',
        'Mahdollistaa suuren viikkokilometrimäärän',
        'Palauttaa kovempien treenien välillä'
      ],
      cues: [
        'Hengitys rauhallinen – voit jutella',
        'Syke 115–138: väsyneenä ja palauttavilla alapäässä, kello hälyttää vasta yli 138',
        'Lyhyt, kevyt askel; älä yliojenna',
        'Hartiat rentoina, kädet ~90°',
        'Katse eteen, ryhti kevyesti pystyssä'
      ],
      mistakes: [
        'Liian kova vauhti “helppoon” (syke yli 138)',
        'Jäykät hartiat ja nyrkit',
        'Pitkä askel kantapääiskulla'
      ],
      video: { type: 'link', url: ytSearch('easy run form cues midfoot'), label: 'Katso video (YouTube-haku)' }
    },
    long_run_cues: {
      id: 'long_run_cues',
      name: 'Pitkä lenkki – vinkit',
      category: 'juoksu',
      equipment: [],
      benefits: [
        'Keskeinen maratonadaptaatio (kestävyys, rasva-aineenvaihdunta)',
        'Harjoittelee nesteytystä ja ravintoa',
        'Rakentaa henkistä kestävyyttä'
      ],
      cues: [
        'Aloita rauhallisesti, pidä vauhti helppona',
        'Syke 115–138 – pitkällä yläpää ok, ei yli 138',
        'Kävelykatkot ok etenkin alussa',
        'Ota juotavaa jos yli ~90 min',
        'Kuuntele kehoa – älä “sankariudu”'
      ],
      mistakes: [
        'Liian kova alku',
        'Ei nestettä pitkällä matkalla',
        'Uusi varuste/ruoka kisaviikolla'
      ],
      video: { type: 'link', url: ytSearch('long run tips marathon training'), label: 'Katso video (YouTube-haku)' }
    },
    tempo_cues: {
      id: 'tempo_cues',
      name: 'Tempo / kynnysjuoksu',
      category: 'juoksu',
      equipment: [],
      benefits: [
        'Nostaa laktaattikynnystä',
        'Parantaa maratonvauhdin taloudellisuutta',
        'Rakentaa “reipasta mutta hallittua” tuntumaa'
      ],
      cues: [
        'Lämmittely 10–15 min helpolla',
        'Tempo: puhumisen rajoilla, ei sprintti',
        'Tasainen hengitys, rentous hartioissa',
        'Jäähdyttely 8–10 min'
      ],
      mistakes: [
        'Tempo muuttuu intervallisprintiksi',
        'Liian vähäinen lämmittely',
        'Ei palautuspäiviä tempon ympärillä'
      ],
      video: { type: 'link', url: ytSearch('tempo run threshold running form'), label: 'Katso video (YouTube-haku)' }
    },
    interval_cues: {
      id: 'interval_cues',
      name: 'Intervallit',
      category: 'juoksu',
      equipment: [],
      benefits: [
        'Parantaa VO2max- ja nopeuskestävyyttä',
        'Tukee huippuvaiheen kisavalmiutta',
        'Tehostaa juoksun ekonomiaa'
      ],
      cues: [
        'Huolellinen lämmittely + muutama kiihdytys',
        'Työjaksot tasaisia, ei täyttä sprinttiä',
        'Palautus hölkäten/kävellen suunnitelman mukaan',
        'Muoto säilyy väsyneenä – lyhennä jos romahtaa'
      ],
      mistakes: [
        'Liian kovat ensimmäiset vedot',
        'Liian lyhyt palautus',
        'Huono lämmittely'
      ],
      video: { type: 'link', url: ytSearch('interval running form VO2max workout'), label: 'Katso video (YouTube-haku)' }
    },
    strides_cues: {
      id: 'strides_cues',
      name: 'Kiihdytykset (strides)',
      category: 'juoksu',
      equipment: [],
      benefits: [
        'Parantaa juoksuasentoa ja hermotusta',
        'Lisää “terävyyttä” ilman kovaa kuormaa',
        'Hyvä base-/taper-vaiheessa'
      ],
      cues: [
        '20 s kiihdytys kohti reipasta, ei maksimisprinttiä',
        'Rentous: kasvot, hartiat, kädet',
        'Palautus kävellen/hölkäten 60–90 s',
        'Pidä tekniikka siistinä'
      ],
      mistakes: [
        'Täysi sprintti liian aikaisin',
        'Jäykkyys ja hampaiden kiristys',
        'Liian monta toistoa väsyneenä'
      ],
      video: { type: 'link', url: ytSearch('running strides form drill'), label: 'Katso video (YouTube-haku)' }
    },

    // ---- Olkapään (kiertäjäkalvo) kuntoutus: kevyt kuorma, kivuton liikerata ----
    codman_pendulum: {
      id: 'codman_pendulum',
      name: 'Codman-heilurit',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: ['pöytä/tuoli tueksi'],
      benefits: [
        'Liikuttaa olkaniveltä lähes ilman lihastyötä – rauhoittaa ärtynyttä kiertäjäkalvoa',
        'Ylläpitää liikerataa ja nivelen ravitsemusta tulehdusvaiheessa',
        'Hyvä aloitus jokaiseen kuntoutusrutiiniin ja kylmähoidon jälkeen'
      ],
      cues: [
        'Tue terve käsi pöytään, kumarru eteen ~45–90°, kipeä käsi roikkuu rentona',
        'Anna käden heilua kehon liikkeen avulla: eteen–taakse, sivulta sivulle, pienet ympyrät',
        'Olkapää täysin rento – liike tulee vartalosta, ei olkalihaksista',
        '30–60 s / suunta, 2–3 kierrosta',
        'Tee vain kivuttomalla alueella – pienennä liikettä, jos tuntuu kipua'
      ],
      mistakes: [
        'Heiluttaa kättä olkalihaksilla (aktiivinen liike)',
        'Liian iso liike tai painon pitäminen kädessä',
        'Hartia nousee korviin'
      ],
      video: { type: 'link', url: ytSearch('codman pendulum exercise shoulder'), label: 'Katso video (YouTube-haku)' }
    },
    wall_circles: {
      id: 'wall_circles',
      name: 'Pallo/käsi seinää vasten – pyöritykset',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: ['pieni pallo (valinnainen)', 'seinä'],
      benefits: [
        'Aktivoi kiertäjäkalvoa ja lapaluun tukilihaksia kevyesti, nivel tuettuna',
        'Parantaa olkapään hallintaa ja asentotuntoa',
        'Matala kuorma – sopii kun liikkeet alkavat olla kivuttomia'
      ],
      cues: [
        'Seiso seinän edessä, kämmen tai pieni pallo seinää vasten hartian korkeudella tai alempana',
        'Paina kevyesti (~20–30 %) ja tee pieniä ympyröitä myötä- ja vastapäivään',
        'Lapaluu hieman taakse ja alas, niska rentona',
        '2×10 ympyrää / suunta',
        'Tee vain kivuttomalla alueella – laske käden korkeutta, jos tuntuu kipua'
      ],
      mistakes: [
        'Liian kova painallus tai liian korkealla',
        'Ympyrät tehdään vartalolla, ei olkapäällä',
        'Hartia kohoaa'
      ],
      video: { type: 'link', url: ytSearch('ball on wall circles shoulder rehab'), label: 'Katso video (YouTube-haku)' }
    },
    wall_walk: {
      id: 'wall_walk',
      name: 'Seinäkävely sormilla',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: ['seinä'],
      benefits: [
        'Palauttaa olkapään nostoliikerataa (fleksio) avustetusti',
        'Seinä kantaa käden painon – vähän kuormaa kiertäjäkalvolle',
        'Konkreettinen mittari edistymiselle (kuinka korkealle kivutta)'
      ],
      cues: [
        'Seiso seinän edessä käsivarren mitan päässä, sormet seinälle vyötärön korkeudelle',
        '"Kävele" sormilla ylöspäin hitaasti, vain niin korkealle kuin kivutta pääsee',
        'Pidä 2–3 s, kävele sormet takaisin alas – älä pudota kättä',
        '2×10 toistoa; voit tehdä myös sivuttain seinään (abduktio)',
        'Tee vain kivuttomalla alueella – ylin piste on kivun alapuolella'
      ],
      mistakes: [
        'Kurottaa kipualueelle "venyttääkseen"',
        'Hartia nousee korviin / selkä notkolle',
        'Käsi pudotetaan alas yläasennosta'
      ],
      video: { type: 'link', url: ytSearch('finger wall walk shoulder exercise'), label: 'Katso video (YouTube-haku)' }
    },
    stick_external_rotation: {
      id: 'stick_external_rotation',
      name: 'Passiivinen ulkokierto kepillä',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: ['keppi/harjanvarsi'],
      benefits: [
        'Palauttaa ulkokiertoa ilman, että kipeä olkapää tekee työtä',
        'Terve käsi tekee liikkeen – kiertäjäkalvo saa levätä',
        'Vähentää jäykkyyttä tulehdusvaiheessa'
      ],
      cues: [
        'Selinmakuu tai seisten, kipeän käden kyynärpää kyljessä 90° kulmassa (pyyhe kyynärpään alle)',
        'Pidä keppiä molemmin käsin; terve käsi työntää kipeää kättä ulospäin',
        'Kipeä käsi on rento – vain mukana',
        'Pidä 3–5 s ääriasennossa, 2×10–15',
        'Tee vain kivuttomalla alueella – kevyt venytys ok, kipu ei'
      ],
      mistakes: [
        'Kyynärpää irtoaa kyljestä',
        'Kipeä käsi jännittää ja tekee työtä',
        'Pakottaa kipualueelle'
      ],
      video: { type: 'link', url: ytSearch('passive external rotation stick shoulder supine'), label: 'Katso video (YouTube-haku)' }
    },
    stick_flexion: {
      id: 'stick_flexion',
      name: 'Fleksio kepillä (selinmakuu)',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: ['keppi/harjanvarsi'],
      benefits: [
        'Avustettu nostoliike – palauttaa liikerataa ylös turvallisesti',
        'Selinmakuu tukee lapaluuta ja vähentää kompensointia',
        'Terve käsi kantaa kuorman'
      ],
      cues: [
        'Selinmakuu polvet koukussa, keppi molemmissa käsissä hartioiden levyisellä otteella',
        'Nosta keppiä suorin käsin kohti kattoa ja edelleen pään yli – terve käsi johtaa',
        'Vain niin pitkälle kuin kivutta pääsee, laske hitaasti',
        '2×10–15',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Alaselkä nousee notkolle',
        'Kipeä käsi tekee liikkeen yksin',
        'Liian nopea tempo'
      ],
      video: { type: 'link', url: ytSearch('supine shoulder flexion with stick wand'), label: 'Katso video (YouTube-haku)' }
    },
    iso_external_rotation: {
      id: 'iso_external_rotation',
      name: 'Isometrinen ulkokierto seinää vasten',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['seinä/ovenkarmi', 'pyyhe'],
      benefits: [
        'Aktivoi ulkokiertäjiä ilman nivelliikettä – usein kivuton jo alkuvaiheessa',
        'Isometria voi lievittää jännekipua',
        'Pohja myöhemmälle kuminauhatyölle'
      ],
      cues: [
        'Seiso kylki seinää/karmia vasten, kyynärpää kyljessä 90°, rullattu pyyhe kyynärpään ja kyljen väliin',
        'Paina käden ulkosyrjällä kevyesti seinää vasten (~20–30 % voimasta) – käsi ei liiku',
        'Pidä 5–10 s, rentouta',
        '2–3×10 toistoa',
        'Tee vain kivuttomalla alueella – painalluksen pitää olla kivuton'
      ],
      mistakes: [
        'Liian kova painallus',
        'Hartia nousee tai vartalo kiertyy',
        'Hengityksen pidättäminen'
      ],
      video: { type: 'link', url: ytSearch('isometric shoulder external rotation wall'), label: 'Katso video (YouTube-haku)' }
    },
    iso_internal_rotation: {
      id: 'iso_internal_rotation',
      name: 'Isometrinen sisäkierto seinää vasten',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['seinä/ovenkarmi', 'pyyhe'],
      benefits: [
        'Aktivoi sisäkiertäjiä (lapaluunalainen lihas) ilman nivelliikettä',
        'Tasapainottaa ulkokiertoharjoittelua',
        'Matala kuorma – sopii tulehdusvaiheeseen'
      ],
      cues: [
        'Seiso ovenkarmin kulmassa, kyynärpää kyljessä 90°, kämmen karmia vasten',
        'Paina kämmenellä kevyesti sisäänpäin (~20–30 %) – käsi ei liiku',
        'Pidä 5–10 s, rentouta',
        '2–3×10 toistoa',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Liian kova painallus',
        'Kyynärpää karkaa kyljestä',
        'Vartalo kiertyy mukaan'
      ],
      video: { type: 'link', url: ytSearch('isometric shoulder internal rotation doorway'), label: 'Katso video (YouTube-haku)' }
    },
    band_internal_rotation: {
      id: 'band_internal_rotation',
      name: 'Sisäkierto kuminauhalla (kevyt)',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['kuminauha (kevyin)'],
      benefits: [
        'Vahvistaa sisäkiertäjiä kevyellä vastuksella',
        'Tasapainottaa olkanivelen lihaksistoa ulkokierron pariksi',
        'Hallittu, pieni liike – vähän ärsytystä'
      ],
      cues: [
        'Nauha ankkuroituna kyynärpään korkeudelle sivulle, kyynärpää kyljessä 90° (pyyhe väliin)',
        'Vedä kyynärvarsi hitaasti vatsaa kohti, palauta hitaammin (2–3 s)',
        'Kevyin nauha: 2–3×12–15 ilman kipua',
        'Hartia alas, rinta auki',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Liian jäykkä nauha',
        'Kyynärpää irtoaa kyljestä',
        'Nopea, nykivä tempo'
      ],
      video: { type: 'link', url: ytSearch('band internal rotation shoulder rehab'), label: 'Katso video (YouTube-haku)' }
    },
    side_lying_external_rotation: {
      id: 'side_lying_external_rotation',
      name: 'Kylkimakuu-ulkokierto (0–1 kg)',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['käsipaino 0,5–1 kg (valinnainen)', 'pyyhe'],
      benefits: [
        'Yksi tehokkaimmista ulkokiertäjien (infraspinatus) vahvistajista',
        'Painovoima antaa kevyen, tasaisen vastuksen',
        'Aloita ilman painoa – nosta vasta kun 3×15 on kivuton'
      ],
      cues: [
        'Makaa terveen puolen kyljellä, kipeän käden kyynärpää kyljessä 90°, rullattu pyyhe kyynärpään alle',
        'Kierrä kyynärvarsi hitaasti ylös kohti kattoa, laske 3 s',
        'Ensin ilman painoa, sitten 0,5–1 kg; 2–3×10–15',
        'Älä makaa kipeän olkapään päällä',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Liian painava käsipaino',
        'Vartalo kiertyy taaksepäin',
        'Kyynärpää nousee kyljestä'
      ],
      video: { type: 'link', url: ytSearch('side lying external rotation rotator cuff'), label: 'Katso video (YouTube-haku)' }
    },
    band_row_low: {
      id: 'band_row_low',
      name: 'Kevyt kuminauhasoutu matalalta',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['kuminauha (kevyt)'],
      benefits: [
        'Vahvistaa lapaluun tukilihaksia (keski-/alaosan epäkäs, vinoneliöt)',
        'Hyvä lapaluun asento keventää kiertäjäkalvon kuormaa',
        'Matala vetokulma – ei käsiä pään yli'
      ],
      cues: [
        'Ankkuroi kevyt nauha vyötärön korkeudelle tai alemmas, kädet edessä alhaalla',
        'Vedä lapaluut ensin taakse ja alas, sitten kyynärpäät kylkien viereen',
        'Hidas palautus 2–3 s; 2–3×12–15',
        'Kyynärpäät alhaalla vartalon vieressä – ei hartian korkeudelle',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Liian kova vastus → hartiat nousevat',
        'Vetää vain käsillä ilman lapaluita',
        'Kyynärpäät nousevat sivuille'
      ],
      video: { type: 'link', url: ytSearch('low row resistance band scapular retraction'), label: 'Katso video (YouTube-haku)' }
    },
    cross_body_stretch: {
      id: 'cross_body_stretch',
      name: 'Olkapään venytys rinnan yli (kevyt)',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: [],
      benefits: [
        'Venyttää olkapään takaosaa ja nivelkapselia pehmeästi',
        'Vähentää takaosan kireyttä, joka voi ahtauttaa olkaniveltä',
        'Helppo tehdä missä tahansa'
      ],
      cues: [
        'Tuo kipeä käsi suorana rinnan yli, terve käsi tukee kyynärpään yläpuolelta',
        'Vedä vain kevyesti – tunne pehmeä venytys olkapään takaosassa',
        'Hartia alas, älä kierrä vartaloa',
        '20–30 s, 2–3 kertaa',
        'Tee vain kivuttomalla alueella – nipistävä tunne olkapään etuosassa = kevennä heti'
      ],
      mistakes: [
        'Vetää voimalla',
        'Hartia nousee korviin',
        'Venyttää kipuun asti'
      ],
      video: { type: 'link', url: ytSearch('gentle cross body shoulder stretch'), label: 'Katso video (YouTube-haku)' }
    },

    // ---- Olkapäätä säästävät jalka-/keskivartalovaihtoehdot ----
    leg_press: {
      id: 'leg_press',
      name: 'Jalkaprässi',
      category: 'voima',
      equipment: ['jalkaprässi (sali)'],
      benefits: [
        'Raskas jalkatyö ilman tankoa hartioilla – olkapää lepää',
        'Kehittää etureisiä ja pakaroita juoksun tueksi',
        'Helppo säätää kuormaa'
      ],
      cues: [
        'Selkä ja lantio tiukasti selkänojaa vasten',
        'Jalat hartioiden levyisesti, polvet varpaiden suuntaan',
        'Laske kunnes polvi ~90°, työnnä koko jalkapohjalla',
        'Älä nojaa käsillä kahvoihin – kädet rennosti'
      ],
      mistakes: [
        'Lantio irtoaa penkistä pohjalla',
        'Polvet lukkoon yläasennossa',
        'Polvet romahtavat sisään'
      ],
      video: { type: 'link', url: ytSearch('leg press proper form'), label: 'Katso video (YouTube-haku)' }
    },
    wall_sit: {
      id: 'wall_sit',
      name: 'Seinäistunta',
      category: 'voima',
      equipment: ['seinä'],
      benefits: [
        'Isometrinen etureisityö ilman välineitä ja ilman käsiä',
        'Vahvistaa polven tukilihaksia (juoksijan polvi -ystävällinen kivun rajoissa)',
        'Ei kuormita olkapäitä'
      ],
      cues: [
        'Selkä seinää vasten, laskeudu kunnes polvet ~90° (tai korkeammalle)',
        'Paino kantapäillä, polvet nilkkojen päällä',
        'Kädet rennosti reisillä tai sivuilla – älä paina seinää',
        '3×30–60 s'
      ],
      mistakes: [
        'Polvet varpaiden yli eteen',
        'Kädet työntävät reisistä',
        'Hengityksen pidättäminen'
      ],
      video: { type: 'link', url: ytSearch('wall sit exercise form'), label: 'Katso video (YouTube-haku)' }
    },
    sl_rdl_bw: {
      id: 'sl_rdl_bw',
      name: 'Yhden jalan RDL ilman painoja',
      category: 'voima',
      equipment: [],
      benefits: [
        'Takareidet, pakarat ja nilkan tasapaino ilman käsiin otettavaa kuormaa',
        'Juoksulle tärkeä yhden jalan hallinta',
        'Olkapää lepää – kädet lantiolla'
      ],
      cues: [
        'Seiso yhdellä jalalla, polvi pehmeänä, kädet lantiolla',
        'Kallistu lonkasta eteen, vapaa jalka suorana taakse – selkä suorana',
        'Palaa pakaralla ylös; 3×8–10 / jalka',
        'Tukeudu tarvittaessa kevyesti terveellä kädellä seinään'
      ],
      mistakes: [
        'Selkä pyöristyy',
        'Lantio kiertyy auki',
        'Tukipolvi lukossa'
      ],
      video: { type: 'link', url: ytSearch('single leg romanian deadlift bodyweight'), label: 'Katso video (YouTube-haku)' }
    },
    step_up_bw: {
      id: 'step_up_bw',
      name: 'Step-up ilman painoja',
      category: 'voima',
      equipment: ['step-lauta / porras'],
      benefits: [
        'Yhden jalan voima ja polven hallinta',
        'Juoksuspesifi työntö ylöspäin',
        'Ei käsiin otettavaa kuormaa'
      ],
      cues: [
        'Koko jalkapohja korokkeelle, nouse etujalan voimalla',
        'Polvi varpaiden suuntaan, vartalo pystyssä',
        'Laske hallitusti; 3×10 / jalka',
        'Kädet rennosti – ei käsipainoja olkapäätilassa'
      ],
      mistakes: [
        'Ponnistaa takajalalla',
        'Polvi romahtaa sisään',
        'Liian korkea koroke'
      ],
      video: { type: 'link', url: ytSearch('bodyweight step up form'), label: 'Katso video (YouTube-haku)' }
    },
    reverse_crunch: {
      id: 'reverse_crunch',
      name: 'Käänteinen vatsarutistus',
      category: 'voima',
      equipment: [],
      benefits: [
        'Alavatsa ja lantion hallinta selinmakuulla',
        'Kädet lattialla rentoina – ei olkapääkuormaa',
        'Korvaa ab wheelin ja lankun olkapäätilassa'
      ],
      cues: [
        'Selinmakuu, kädet kyljillä lattialla rentoina, polvet 90°',
        'Kierrä lantio irti lattiasta vatsalihaksilla, polvet kohti rintaa',
        'Laske hitaasti 3 s; 3×10–12',
        'Älä paina käsillä lattiaan'
      ],
      mistakes: [
        'Heilauttaa jaloilla vauhtia',
        'Painaa käsillä',
        'Liian nopea lasku'
      ],
      video: { type: 'link', url: ytSearch('reverse crunch proper form'), label: 'Katso video (YouTube-haku)' }
    },

    // ---- Kuntoutus-/vinkkiliikkeet (konservatiiviset treenivinkit) ----
    calf_raise_eccentric: {
      id: 'calf_raise_eccentric',
      name: 'Eksentrinen pohjenosto',
      category: 'voima',
      equipment: ['step-lauta'],
      benefits: [
        'Kuormittaa akillesta ja pohjetta hallitusti',
        'Yleinen progressiivinen jännekuormitus (treenivinkki)',
        'Tukee pohkeiden eksentristä voimaa'
      ],
      cues: [
        'Nouse kahdella jalalla ylös',
        'Laske yhdellä jalalla hitaasti 3–4 s',
        'Päkiät stepillä, kannat vapaana venytykseen',
        'Kipu ≤3/10 – lopeta jos kipu nousee treenin jälkeen'
      ],
      mistakes: [
        'Liian nopea lasku',
        'Maksimikipuun asti pakottaminen',
        'Äkillinen volyymin nosto'
      ],
      video: { type: 'link', url: ytSearch('eccentric calf raise achilles'), label: 'Katso video (YouTube-haku)' }
    },
    band_external_rotation: {
      id: 'band_external_rotation',
      name: 'Ulkokierto kuminauhalla (kevyt)',
      category: 'voima',
      rehab: 'shoulder',
      equipment: ['kuminauha'],
      benefits: [
        'Vahvistaa kiertäjäkalvon ulkokiertäjiä',
        'Tukee olkapään hallintaa',
        'Hyvä kevyt olkapäätyö ilman raskasta punnerrusta'
      ],
      cues: [
        'Kyynärpää kyljessä ~90°',
        'Kierrä kyynärvarsi ulos nauhaa vasten',
        'Hidas tempo, pieni liike riittää – kevyin nauha, 2–3×12–15',
        'Hartia alas – älä kohota olkapäätä',
        'Rullattu pyyhe kyynärpään ja kyljen väliin helpottaa asentoa',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Kyynärpää irtoaa kyljestä',
        'Liian jäykkä nauha / liian iso liike',
        'Olkapään kohotus'
      ],
      video: { type: 'link', url: ytSearch('band external rotation rotator cuff'), label: 'Katso video (YouTube-haku)' }
    },
    scap_squeeze: {
      id: 'scap_squeeze',
      name: 'Lapaluiden puristus',
      category: 'liikkuvuus',
      rehab: 'shoulder',
      equipment: [],
      benefits: [
        'Aktivoi yläselän ja lapaluun tukilihaksia',
        'Tukee olkapään asentoa',
        'Helppo lämmittely-/taukoliike'
      ],
      cues: [
        'Seisten tai istuen: purista lapaluut yhteen',
        'Lapaluut taakse ja hieman alas, pidä 3–5 s, rentouta',
        '2–3×12–15 toistoa',
        'Rinta auki, niska rentona',
        'Tee vain kivuttomalla alueella'
      ],
      mistakes: [
        'Kohottaa hartioita korviin',
        'Liioiteltu notko alaselässä',
        'Pidättää hengitystä'
      ],
      video: { type: 'link', url: ytSearch('scapular squeeze exercise'), label: 'Katso video (YouTube-haku)' }
    },
    glute_med_side_lie: {
      id: 'glute_med_side_lie',
      name: 'Kylkimakuu-lonkan loitonnus (glute med)',
      category: 'voima',
      equipment: [],
      benefits: [
        'Vahvistaa keskipakaralihasta',
        'Tukee lonkan hallintaa juoksussa',
        'Hyödyllinen IT-jänne- ja polvikuorman hallintaan (treenivinkki)'
      ],
      cues: [
        'Kylkimakuu, alavartalo suorana',
        'Nosta yläjalka sivulle ilman kiertoa eteen',
        'Hidas tempo 8–12 toistoa / puoli',
        'Vartalo vakaana – älä kaadu taakse'
      ],
      mistakes: [
        'Heiluttaa vartaloa',
        'Kiertää jalkaa eteen (TFL-kompensaatio)',
        'Liian nopea tempo'
      ],
      video: { type: 'link', url: ytSearch('side lying hip abduction glute med'), label: 'Katso video (YouTube-haku)' }
    },
    towel_stretch_foot: {
      id: 'towel_stretch_foot',
      name: 'Pyyhevenytys jalkaterälle',
      category: 'liikkuvuus',
      equipment: ['pyyhe'],
      benefits: [
        'Venyttää pohjetta ja jalkapohjan kalvoa pehmeästi',
        'Yleinen aamu-/iltarutiini plantaarikivun kevennykseen (treenivinkki)',
        'Helppo kotona ilman välineitä (pyyhe riittää)'
      ],
      cues: [
        'Istu, pyyhe jalkaterän ympäri',
        'Vedä pehmeästi varpaita kohti – tunne venytys pohkeessa/pohjassa',
        '20–30 s, 2–3 kertaa',
        'Kevyt venytys ok, terävä kipu ei'
      ],
      mistakes: [
        'Nykäisee voimalla',
        'Pakottaa kivuliaaseen ääriasentoon',
        'Unohtaa vastakkaisen jalan'
      ],
      video: { type: 'link', url: ytSearch('towel stretch plantar fascia'), label: 'Katso video (YouTube-haku)' }
    }
  };

  function getExercise(id) {
    return EXERCISES[id] || null;
  }

  function listExercises(category) {
    return Object.values(EXERCISES).filter((e) => !category || e.category === category);
  }

  function allIds() {
    return Object.keys(EXERCISES);
  }

  /** Kuormittaako liike olkapäätä (kiertäjäkalvo)? Tuntematon id → false. */
  function loadsShoulder(id) {
    const e = EXERCISES[id];
    return !!(e && e.loadsShoulder);
  }

  /** Olkapään kuntoutusliikkeet (rehab: 'shoulder'). */
  function shoulderRehabExercises() {
    return Object.values(EXERCISES).filter((e) => e.rehab === 'shoulder');
  }

  function embedUrl(ex) {
    if (!ex || !ex.video || ex.video.type !== 'embed' || !ex.video.youtubeId) return null;
    return ytEmbed(ex.video.youtubeId);
  }

  function externalUrl(ex) {
    if (!ex || !ex.video) return null;
    if (ex.video.type === 'embed' && ex.video.youtubeId) return ytWatch(ex.video.youtubeId);
    return ex.video.url || null;
  }

  global.TreeniExercises = {
    EXERCISES,
    getExercise,
    listExercises,
    allIds,
    loadsShoulder,
    shoulderRehabExercises,
    embedUrl,
    externalUrl,
    ytEmbed,
    ytWatch,
    ytSearch
  };
})(typeof window !== 'undefined' ? window : global);
