import { pick } from "./i18n.js";

const MATERIAL_MAP = {
  "Орех": "Жаңғақ",
  "Клён": "Үйеңкі",
  "Абрикос": "Өрік",
  "Красное дерево": "Қызыл ағаш",
  "Тянь-Шаньская ель": "Тянь-Шань шыршасы",
  "Комбинированный": "Аралас"
};

const CITY_MAP = {
  Алматы: "Алматы",
  Астана: "Астана",
  Караганда: "Қарағанды",
  Кызылорда: "Қызылорда",
  Туркестан: "Түркістан"
};

const PRODUCT_KK = {
  "altyn-mura-concert": {
    name: "Altyn Mura Concert домбырасы",
    badge: "Концерттік",
    description: "Терең сахналық тембрі бар премиум қолөнер домбырасы.",
    long_description:
      "Алматыдағы шебер 180 сағатта жасаған. Кептірілген тұтас жаңғақ, дәстүрлі корпус геометриясы және «қошқар мүйіз» өрнегімен нәзік ою."
  },
  "dala-uni-student": {
    name: "Dala Uni Student домбырасы",
    badge: "Классикалық",
    description: "Музыка мектебіне арналған жеңіл әрі сезімтал модель.",
    long_description:
      "Жұмсақ шабуыл мен тұрақты бұраудың теңгерімі. Жаңадан бастаушыларға да, жалғастырушыларға да ыңғайлы, жұмсақ қаппен бірге беріледі."
  },
  "sary-arka-pro": {
    name: "Sary Arka Pro домбырасы",
    badge: "Концерттік",
    description: "Жеке орындау мен жазбаға арналған жарқын тембр.",
    long_description:
      "Дыбыс проекциясы күшейтілген және мінсіз интонация үшін пернелері қолмен дәл бапталған модель."
  },
  "kuishi-premium": {
    name: "KuiShi Premium домбырасы",
    badge: "Премиум резонанс",
    description: "Жеке сахна мен ансамбльге арналған теңгерімді домбыра.",
    long_description:
      "Қызыл ағаштан жасалған корпус, резонанс қолмен бапталған. Тікелей концерттерде өте жақсы ашылады."
  },
  "zhyrau-heritage": {
    name: "Zhyrau Heritage домбырасы",
    badge: "Классикалық",
    description: "Этно-репертуарға арналған жылы камералық дыбыс.",
    long_description:
      "Күй орындауда тұрақты бұрау мен жұмсақ динамикаға мән берілген классикалық технологиямен жиналған."
  },
  "ustaz-master": {
    name: "Ustaz Master домбырасы",
    badge: "Премиум резонанс",
    description: "Концерт сахнасына арналған обертонға бай терең дыбыс.",
    long_description:
      "Әр домбыра екі кезеңді акустикалық баптаудан және ағаш ылғалдылығының қатаң бақылауынан өтеді."
  },
  "tengri-spruce-classic": {
    name: "Tengri Spruce Classic домбырасы",
    badge: "Классикалық",
    description: "Мектеп пен сахнаға арналған анық шабуыл, таза тембр.",
    long_description:
      "Тянь-Шань шыршасы дыбыстың ашықтығын береді, ал пернелер мен бұрау тұрақтылығы шебермен мұқият реттелген."
  },
  "saz-serisi-fusion": {
    name: "Saz Serisi Fusion домбырасы",
    badge: "Премиум резонанс",
    description: "Аралас ағаштардан алынған бай обертондар мен терең дыбыс.",
    long_description:
      "Ағаштардың үйлесімі тембрді байытады: жұмсақ орта, сенімді төмен және тұрақты строй. Жазба мен сахнаға өте қолайлы."
  }
};

function localizeSingle(product, locale = "ru") {
  if (!product) return product;

  if (locale !== "kk") {
    return product;
  }

  const translated = PRODUCT_KK[product.slug] || {};
  return {
    ...product,
    category: pick(locale, product.category, "Домбыра"),
    material: MATERIAL_MAP[product.material] || product.material,
    city: CITY_MAP[product.city] || product.city,
    name: translated.name || product.name,
    badge: translated.badge || product.badge,
    description: translated.description || product.description,
    long_description: translated.long_description || product.long_description
  };
}

export function localizeProduct(product, locale = "ru") {
  return localizeSingle(product, locale);
}

export function localizeProducts(products, locale = "ru") {
  return products.map((item) => localizeSingle(item, locale));
}
