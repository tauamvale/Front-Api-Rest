const API_URL = 'http://localhost:3000/products';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const productList = document.querySelector('#products');
const productCount = document.querySelector('#product-count');
const addProductForm = document.querySelector('#add-product-form');
const updateProductForm = document.querySelector('#update-product-form');
const cancelUpdateButton = document.querySelector('#cancel-update');
const searchForm = document.querySelector('#search-form');
const clearSearchButton = document.querySelector('#clear-search');
const searchResult = document.querySelector('#search-result');
const messageBox = document.querySelector('#message');

let lastSearch = null; // { by, value } of the search currently shown
let messageTimer;

// ---------- Helpers ----------

function showMessage(text, type = 'success') {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { messageBox.hidden = true; }, 4000);
}

// Wrapper around fetch that never breaks when the server answers with an
// empty body (e.g. 204 on DELETE) and that always asks for fresh data.
async function request(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${response.status})`);
  }
  return data;
}

function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product';

  const header = document.createElement('div');
  header.className = 'product-header';
  const title = document.createElement('h3');
  title.textContent = product.name;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = `#${product.id}`;
  header.append(title, badge);

  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = formatPrice(product.price);

  const description = document.createElement('p');
  description.className = product.description ? 'description' : 'description empty';
  description.textContent = product.description || 'No description';

  const actions = document.createElement('div');
  actions.className = 'actions';

  const updateButton = document.createElement('button');
  updateButton.type = 'button';
  updateButton.className = 'btn btn-secondary';
  updateButton.textContent = 'Update';
  updateButton.addEventListener('click', () => startEdit(product));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn btn-danger';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => handleDelete(product));

  actions.append(updateButton, deleteButton);
  card.append(header, price, description, actions);
  return card;
}

// ---------- List ----------

async function fetchProducts() {
  try {
    const data = await request(API_URL);
    const products = Array.isArray(data) ? data : [];

    // Keep a stable order, so an edited product does not jump around
    products.sort((a, b) =>
      typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0
    );

    productList.replaceChildren();
    productCount.textContent = products.length;

    if (products.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No products yet. Add the first one above.';
      productList.appendChild(empty);
      return;
    }

    products.forEach(product => productList.appendChild(createProductCard(product)));
  } catch (error) {
    showMessage(`Could not load products: ${error.message}`, 'error');
  }
}

// ---------- Add ----------

addProductForm.addEventListener('submit', async event => {
  event.preventDefault();
  const { name, price, description } = addProductForm.elements;
  try {
    await request(API_URL, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: name.value.trim(),
        price: Number(price.value),
        description: description.value.trim()
      })
    });
    addProductForm.reset();
    showMessage('Product added.');
    await refreshSearch();
  } catch (error) {
    showMessage(`Could not add product: ${error.message}`, 'error');
  }
  await fetchProducts(); // refresh right after the action
});

// ---------- Update ----------

function startEdit(product) {
  const form = updateProductForm.elements;
  form.productId.value = product.id;
  form.name.value = product.name;
  form.price.value = product.price;
  form.description.value = product.description || '';
  updateProductForm.hidden = false;
  updateProductForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.name.focus();
}

function closeEdit() {
  updateProductForm.reset();
  updateProductForm.hidden = true;
}

cancelUpdateButton.addEventListener('click', closeEdit);

updateProductForm.addEventListener('submit', async event => {
  event.preventDefault();
  const { productId, name, price, description } = updateProductForm.elements;
  const id = productId.value;
  try {
    await request(`${API_URL}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: name.value.trim(),
        price: Number(price.value),
        description: description.value.trim()
      })
    });
    closeEdit();
    showMessage('Product updated.');
    await refreshSearch();
  } catch (error) {
    showMessage(`Could not update product: ${error.message}`, 'error');
  }
  await fetchProducts();
});

// ---------- Delete ----------

async function handleDelete(product) {
  if (!confirm(`Delete "${product.name}"?`)) return;
  try {
    await request(`${API_URL}/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    showMessage('Product deleted.');
    await refreshSearch();
    if (updateProductForm.elements.productId.value === String(product.id)) closeEdit();
  } catch (error) {
    showMessage(`Could not delete product: ${error.message}`, 'error');
  }
  await fetchProducts();
}

// ---------- Search (by ID or by part of the name) ----------

const searchBySelect = document.querySelector('#search-by');
const searchValueInput = document.querySelector('#search-value');

function updatePlaceholder() {
  searchValueInput.placeholder =
    searchBySelect.value === 'id' ? 'Product ID' : 'Type part of the name';
}

async function runSearch(by, value) {
  const path = by === 'id'
    ? `${API_URL}/${encodeURIComponent(value)}`
    : `${API_URL}/search?name=${encodeURIComponent(value)}`;
  lastSearch = { by, value }; // kept so the result refreshes after add/update/delete
  try {
    const data = await request(path);
    const products = (Array.isArray(data) ? data : [data]).filter(Boolean);
    if (products.length === 0) throw new Error('not found');
    searchResult.replaceChildren(...products.map(createProductCard));
  } catch (error) {
    if (by === 'name' && error.message !== 'not found') {
      showMessage(`Search failed: ${error.message}`, 'error');
    }
    const notFound = document.createElement('p');
    notFound.className = 'empty-state';
    notFound.textContent = by === 'id'
      ? `No product found with ID ${value}.`
      : `No product found with a name containing "${value}".`;
    searchResult.replaceChildren(notFound);
  }
}

async function refreshSearch() {
  if (lastSearch) await runSearch(lastSearch.by, lastSearch.value);
}

function clearSearch() {
  searchForm.reset();
  updatePlaceholder();
  lastSearch = null;
  searchResult.replaceChildren();
}

searchForm.addEventListener('submit', async event => {
  event.preventDefault();
  const value = searchValueInput.value.trim();
  if (value) await runSearch(searchBySelect.value, value);
});

searchBySelect.addEventListener('change', updatePlaceholder);
clearSearchButton.addEventListener('click', clearSearch);
updatePlaceholder();

// ---------- Start ----------

fetchProducts();
