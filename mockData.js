// Données de test initiales pour le localisateur de foodtrucks
const INITIAL_VENDORS = [
  {
    id: "v-burger",
    name: "Le Camion Gourmand",
    description: "Burgers gourmets artisanaux avec des frites maison croustillantes et des sauces secrètes. Ingrédients 100% locaux et viande d'origine française.",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
    phone: "06 12 34 56 78",
    ownerUsername: "burger",
    ownerPassword: "password123",
    menu: [
      { id: "m1", name: "Le Classique", description: "Bœuf charolais, cheddar affiné, salade, tomates, oignons caramélisés, sauce maison.", price: 11.50 },
      { id: "m2", name: "Le Savoyard", description: "Bœuf charolais, reblochon AOP, lardons grillés, oignons, sauce moutarde à l'ancienne.", price: 13.00 },
      { id: "m3", name: "Le Veggie", description: "Galette de quinoa et patate douce, avocat, tomates, pousses d'épinards, sauce yaourt aux herbes.", price: 12.00 },
      { id: "m4", name: "Frites Maison", description: "Double cuisson à la belge, sel de Guérande.", price: 3.50 }
    ],
    schedule: {
      "Lundi": { active: true, city: "Paris", address: "Champ de Mars, 75007 Paris", lat: 48.8556, lng: 2.2986, openTime: "11:30", closeTime: "14:30" },
      "Mardi": { active: true, city: "Paris", address: "Champ de Mars, 75007 Paris", lat: 48.8556, lng: 2.2986, openTime: "11:30", closeTime: "14:30" },
      "Mercredi": { active: true, city: "Paris", address: "15 Rue de Vaugirard, 75006 Paris (Jardin du Luxembourg)", lat: 48.8475, lng: 2.3371, openTime: "12:00", closeTime: "15:00" },
      "Jeudi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Vendredi": { active: true, city: "Puteaux", address: "La Défense, Esplanade de la Défense, 92800 Puteaux", lat: 48.8897, lng: 2.2418, openTime: "11:30", closeTime: "20:00" },
      "Samedi": { active: true, city: "Puteaux", address: "La Défense, Esplanade de la Défense, 92800 Puteaux", lat: 48.8897, lng: 2.2418, openTime: "12:00", closeTime: "22:00" },
      "Dimanche": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" }
    }
  },
  {
    id: "v-pizza",
    name: "La Bella Vita",
    description: "Véritable pizza napolitaine cuite au feu de bois dans notre camion aménagé. Pâte à longue fermentation et ingrédients importés d'Italie.",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
    phone: "07 98 76 54 32",
    ownerUsername: "pizza",
    ownerPassword: "password123",
    menu: [
      { id: "p1", name: "Margherita", description: "Sauce tomate San Marzano, mozzarella di bufala, basilic frais, huile d'olive vierge extra.", price: 9.50 },
      { id: "p2", name: "Diavola", description: "Sauce tomate, mozzarella, salame piccante calabrais, olives noires.", price: 11.50 },
      { id: "p3", name: "Quattro Formaggi", description: "Mozzarella, gorgonzola, taleggio, parmesan, filet de miel.", price: 12.50 },
      { id: "p4", name: "Tiramisu Maison", description: "Recette traditionnelle au café et mascarpone.", price: 4.50 }
    ],
    schedule: {
      "Lundi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Mardi": { active: true, city: "Lyon", address: "Place Bellecour, 69002 Lyon", lat: 45.7578, lng: 4.8322, openTime: "11:30", closeTime: "14:00" },
      "Mercredi": { active: true, city: "Lyon", address: "Parc de la Tête d'Or, 69006 Lyon", lat: 45.7772, lng: 4.8525, openTime: "11:00", closeTime: "18:00" },
      "Jeudi": { active: true, city: "Lyon", address: "Place Bellecour, 69002 Lyon", lat: 45.7578, lng: 4.8322, openTime: "11:30", closeTime: "14:00" },
      "Vendredi": { active: true, city: "Lyon", address: "Gare de Lyon-Part-Dieu, 69003 Lyon", lat: 45.7606, lng: 4.8598, openTime: "17:30", closeTime: "22:30" },
      "Samedi": { active: true, city: "Lyon", address: "Gare de Lyon-Part-Dieu, 69003 Lyon", lat: 45.7606, lng: 4.8598, openTime: "17:30", closeTime: "22:30" },
      "Dimanche": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" }
    }
  },
  {
    id: "v-tacos",
    name: "Tacos el Sol",
    description: "Tacos mexicains authentiques servis sur des tortillas de maïs faites maison. Saveurs explosives, coriandre fraîche et citrons verts.",
    image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=600&q=80",
    phone: "06 55 44 33 22",
    ownerUsername: "tacos",
    ownerPassword: "password123",
    menu: [
      { id: "t1", name: "Tacos al Pastor (x3)", description: "Porc mariné aux épices et à l'ananas, oignons, coriandre.", price: 9.00 },
      { id: "t2", name: "Tacos Barbacoa (x3)", description: "Bœuf mijoté pendant 6 heures, sauce salsa verde, oignons.", price: 10.00 },
      { id: "t3", name: "Tacos Pollo (x3)", description: "Poulet effiloché grillé, salsa chipotle, crème d'avocat.", price: 9.50 },
      { id: "t4", name: "Guacamole & Totopos", description: "Guacamole frais pilé au mortier, chips de tortilla maison.", price: 4.50 }
    ],
    schedule: {
      "Lundi": { active: true, city: "Marseille", address: "Vieux-Port de Marseille, 13001 Marseille", lat: 43.2951, lng: 5.3742, openTime: "12:00", closeTime: "15:00" },
      "Mardi": { active: false, city: "", address: "", lat: 0, lng: 0, openTime: "", closeTime: "" },
      "Mercredi": { active: true, city: "Marseille", address: "Plage du Prado, 13008 Marseille", lat: 43.2598, lng: 5.3758, openTime: "12:00", closeTime: "21:00" },
      "Jeudi": { active: true, city: "Marseille", address: "Vieux-Port de Marseille, 13001 Marseille", lat: 43.2951, lng: 5.3742, openTime: "12:00", closeTime: "15:00" },
      "Vendredi": { active: true, city: "Marseille", address: "Plage du Prado, 13008 Marseille", lat: 43.2598, lng: 5.3758, openTime: "12:00", closeTime: "22:00" },
      "Samedi": { active: true, city: "Marseille", address: "Plage du Prado, 13008 Marseille", lat: 43.2598, lng: 5.3758, openTime: "12:00", closeTime: "22:00" },
      "Dimanche": { active: true, city: "Marseille", address: "Vieux-Port de Marseille, 13001 Marseille", lat: 43.2951, lng: 5.3742, openTime: "18:00", closeTime: "22:00" }
    }
  }
];

// Rendre disponible globalement
window.INITIAL_VENDORS = INITIAL_VENDORS;
