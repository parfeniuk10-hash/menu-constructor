const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRMfVQJvJELdngi52XfLsJAL4n_24Dgwtu66uUQFPf41kHKF2tHcZ1rOdXexys7SKcA_7tc3XQsDV6c/pub?gid=0&single=true&output=csv";

let products = [];
let selectedProductIds = new Set();

const meals = [
  { key: "breakfast", title: "Сніданок", ratio: 0.25 },
  { key: "snack1", title: "Перекус 1", ratio: 0.10 },
  { key: "lunch", title: "Обід", ratio: 0.30 },
  { key: "snack2", title: "Перекус 2", ratio: 0.10 },
  { key: "dinner", title: "Вечеря", ratio: 0.25 }
];

const categoryLabels = {
  protein: "Білкові продукти",
  protein_fat: "Білки + жири",
  dairy: "Молочні продукти",
  carbs: "Вуглеводи",
  carbs_protein: "Вуглеводи + білки",
  fruit: "Фрукти",
  vegetable: "Овочі",
  fat: "Жири",
  fat_dairy: "Молочні жири",
  dish: "Готові страви"
};

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();

  document.getElementById("generateBtn").addEventListener("click", generateMenu);
  document.getElementById("clearBtn").addEventListener("click", clearSelection);
});

async function loadProducts() {
  const productsContainer = document.getElementById("products");

  try {
    const response = await fetch(SHEET_CSV_URL + "&cacheBust=" + Date.now());

    if (!response.ok) {
      throw new Error("Не вдалося завантажити таблицю");
    }

    const csvText = await response.text();
    products = parseCSV(csvText);

    renderProducts();
  } catch (error) {
    productsContainer.innerHTML = `
      <p class="bad">
        Помилка завантаження продуктів. Перевірте CSV-посилання Google Sheets.
      </p>
    `;
    console.error(error);
  }
}

function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (currentValue || currentRow.length > 0) {
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = "";
      }
    } else {
      currentValue += char;
    }
  }

  if (currentValue || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const headers = rows[0].map(header => header.trim());

  return rows.slice(1)
    .filter(row => row.length > 1)
    .map(row => {
      const item = {};

      headers.forEach((header, index) => {
        item[header] = row[index] ? row[index].trim() : "";
      });

      return {
        id: String(item.id),
        name: item.name,
        kcal: Number(item.kcal),
        protein: Number(item.protein),
        fat: Number(item.fat),
        carbs: Number(item.carbs),
        category: item.category,
        meals: item.meals,
        mealKeys: item.meals.split(",").map(meal => meal.trim()),
        min_g: Number(item.min_g),
        max_g: Number(item.max_g)
      };
    })
    .filter(product => product.name && !Number.isNaN(product.kcal));
}

function renderProducts() {
  const container = document.getElementById("products");
  container.innerHTML = "";

  const grouped = groupProductsByCategory(products);

  Object.keys(grouped).forEach(category => {
    const group = document.createElement("div");
    group.className = "product-group";

    const title = document.createElement("h3");
    title.textContent = categoryLabels[category] || category;
    group.appendChild(title);

    const buttonsWrapper = document.createElement("div");
    buttonsWrapper.className = "products";

    grouped[category].forEach(product => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "product-btn";
      button.textContent = product.name;

      button.addEventListener("click", () => {
        toggleProduct(product.id, button);
      });

      buttonsWrapper.appendChild(button);
    });

    group.appendChild(buttonsWrapper);
    container.appendChild(group);
  });
}

function groupProductsByCategory(productList) {
  return productList.reduce((groups, product) => {
    if (!groups[product.category]) {
      groups[product.category] = [];
    }

    groups[product.category].push(product);
    return groups;
  }, {});
}

function toggleProduct(productId, button) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
    button.classList.remove("selected");
  } else {
    selectedProductIds.add(productId);
    button.classList.add("selected");
  }
}

function clearSelection() {
  selectedProductIds.clear();

  document.querySelectorAll(".product-btn").forEach(button => {
    button.classList.remove("selected");
  });

  document.getElementById("menu").innerHTML = "Поки що меню не згенеровано.";
  document.getElementById("summary").innerHTML = "Після генерації тут з’являться калорії та БЖВ.";
}

function generateMenu() {
  const selectedProducts = products.filter(product => selectedProductIds.has(product.id));

  if (selectedProducts.length === 0) {
    document.getElementById("menu").innerHTML = `
      <p class="bad">Спочатку оберіть хоча б кілька продуктів.</p>
    `;
    return;
  }

  const targets = getTargets();

  const generatedMenu = meals.map((meal, index) => {
    const mealTargets = {
      kcal: targets.kcal * meal.ratio,
      protein: targets.protein * meal.ratio,
      fat: targets.fat * meal.ratio,
      carbs: targets.carbs * meal.ratio
    };

    const eligibleProducts = selectedProducts.filter(product => {
      return product.mealKeys.includes(meal.key);
    });

    const candidates = chooseCandidatesForMeal(eligibleProducts, meal.key, index);
    const optimizedItems = optimizeMeal(candidates, mealTargets);

    return {
      ...meal,
      targets: mealTargets,
      items: optimizedItems
    };
  });

  renderMenu(generatedMenu);
  renderSummary(generatedMenu, targets);
}

function getTargets() {
  return {
    kcal: Number(document.getElementById("targetKcal").value),
    protein: Number(document.getElementById("targetProtein").value),
    fat: Number(document.getElementById("targetFat").value),
    carbs: Number(document.getElementById("targetCarbs").value)
  };
}

function chooseCandidatesForMeal(eligibleProducts, mealKey, mealIndex) {
  if (eligibleProducts.length === 0) {
    return [];
  }

  let desiredCategories = [];

  if (mealKey === "breakfast") {
    desiredCategories = [
      ["protein", "protein_fat", "dairy", "dish"],
      ["carbs", "fruit"],
      ["fruit", "vegetable"],
      ["fat", "fat_dairy"]
    ];
  } else if (mealKey === "snack1" || mealKey === "snack2") {
    desiredCategories = [
      ["dairy", "dish", "protein"],
      ["fruit", "carbs"],
      ["fat", "fat_dairy"]
    ];
  } else {
    desiredCategories = [
      ["protein", "protein_fat"],
      ["carbs", "carbs_protein"],
      ["vegetable"],
      ["fat", "fat_dairy"]
    ];
  }

  const selected = [];

  desiredCategories.forEach((categoryGroup, groupIndex) => {
    const matches = eligibleProducts.filter(product => {
      return categoryGroup.includes(product.category) &&
        !selected.find(selectedProduct => selectedProduct.id === product.id);
    });

    if (matches.length > 0) {
      const pickedIndex = (mealIndex + groupIndex) % matches.length;
      selected.push(matches[pickedIndex]);
    }
  });

  if (selected.length === 0) {
    return eligibleProducts.slice(0, 3);
  }

  return selected.slice(0, 4);
}

function optimizeMeal(candidates, targets) {
  if (candidates.length === 0) {
    return [];
  }

  const gramOptions = candidates.map(product => {
    const step = product.category === "fat" || product.category === "fat_dairy" ? 1 : 10;
    const options = [];

    for (let grams = product.min_g; grams <= product.max_g; grams += step) {
      options.push(grams);
    }

    return options;
  });

  let bestCombination = null;
  let bestScore = Infinity;

  function search(index, currentItems) {
    if (index === candidates.length) {
      const totals = calculateTotals(currentItems);
      const score = calculateScore(totals, targets);

      if (score < bestScore) {
        bestScore = score;
        bestCombination = [...currentItems];
      }

      return;
    }

    const product = candidates[index];

    gramOptions[index].forEach(grams => {
      const calculated = calculateProduct(product, grams);
      currentItems.push(calculated);
      search(index + 1, currentItems);
      currentItems.pop();
    });
  }

  search(0, []);

  return bestCombination || [];
}

function calculateProduct(product, grams) {
  const factor = grams / 100;

  return {
    id: product.id,
    name: product.name,
    grams,
    kcal: product.kcal * factor,
    protein: product.protein * factor,
    fat: product.fat * factor,
    carbs: product.carbs * factor
  };
}

function calculateTotals(items) {
  return items.reduce((totals, item) => {
    totals.kcal += item.kcal;
    totals.protein += item.protein;
    totals.fat += item.fat;
    totals.carbs += item.carbs;
    return totals;
  }, {
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0
  });
}

function calculateScore(totals, targets) {
  const kcalError = Math.abs(totals.kcal - targets.kcal) / Math.max(targets.kcal, 1);
  const proteinError = Math.abs(totals.protein - targets.protein) / Math.max(targets.protein, 1);
  const fatError = Math.abs(totals.fat - targets.fat) / Math.max(targets.fat, 1);
  const carbsError = Math.abs(totals.carbs - targets.carbs) / Math.max(targets.carbs, 1);

  return kcalError * 2.5 + proteinError * 1.7 + fatError * 1.2 + carbsError * 1.2;
}

function renderMenu(menu) {
  const container = document.getElementById("menu");
  container.innerHTML = "";

  menu.forEach(meal => {
    const div = document.createElement("div");
    div.className = "meal";

    if (meal.items.length === 0) {
      div.innerHTML = `
        <h3>${meal.title}</h3>
        <p class="bad">Немає вибраних продуктів, дозволених для цього прийому їжі.</p>
      `;
      container.appendChild(div);
      return;
    }

    const mealTotals = calculateTotals(meal.items);

    const itemsHtml = meal.items.map(item => `
      <li>
        <strong>${item.name}</strong> — ${item.grams} г:
        ${round(item.kcal)} ккал /
        Б ${round(item.protein)} г /
        Ж ${round(item.fat)} г /
        В ${round(item.carbs)} г
      </li>
    `).join("");

    div.innerHTML = `
      <h3>${meal.title}</h3>
      <p>
        <strong>Разом:</strong>
        ${round(mealTotals.kcal)} ккал /
        Б ${round(mealTotals.protein)} г /
        Ж ${round(mealTotals.fat)} г /
        В ${round(mealTotals.carbs)} г
      </p>
      <ul>${itemsHtml}</ul>
    `;

    container.appendChild(div);
  });
}

function renderSummary(menu, targets) {
  const allItems = menu.flatMap(meal => meal.items);
  const totals = calculateTotals(allItems);

  const kcalDiff = totals.kcal - targets.kcal;
  const proteinDiff = totals.protein - targets.protein;
  const fatDiff = totals.fat - targets.fat;
  const carbsDiff = totals.carbs - targets.carbs;

  document.getElementById("summary").innerHTML = `
    <div class="summary-box">
      <p>
        <strong>Калорії:</strong>
        ${round(totals.kcal)} / ${targets.kcal} ккал
        <span class="${getDiffClass(kcalDiff, 50)}">(${formatDiff(kcalDiff)})</span>
      </p>

      <p>
        <strong>Білки:</strong>
        ${round(totals.protein)} / ${targets.protein} г
        <span class="${getDiffClass(proteinDiff, 7)}">(${formatDiff(proteinDiff)})</span>
      </p>

      <p>
        <strong>Жири:</strong>
        ${round(totals.fat)} / ${targets.fat} г
        <span class="${getDiffClass(fatDiff, 6)}">(${formatDiff(fatDiff)})</span>
      </p>

      <p>
        <strong>Вуглеводи:</strong>
        ${round(totals.carbs)} / ${targets.carbs} г
        <span class="${getDiffClass(carbsDiff, 10)}">(${formatDiff(carbsDiff)})</span>
      </p>
    </div>
  `;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function formatDiff(value) {
  const rounded = round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function getDiffClass(value, tolerance) {
  const absolute = Math.abs(value);

  if (absolute <= tolerance) {
    return "good";
  }

  if (absolute <= tolerance * 2) {
    return "warning";
  }

  return "bad";
}
