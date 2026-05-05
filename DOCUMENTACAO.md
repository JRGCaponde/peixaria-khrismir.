# Peixaria Khrismir — Documentação Completa
#documentacao #peixaria #khrismir #angola

> **LEIA PRIMEIRO** — Este ficheiro é a fonte primária de verdade sobre o projecto. Antes de procurar em qualquer outro local, consulte as secções abaixo.

---

## Índice

1. [[#Visão Geral do Projecto]]
2. [[#Stack Tecnológico]]
3. [[#Arquitectura — Dois Modos]]
4. [[#Estrutura de Ficheiros]]
5. [[#Rotas da Aplicação]]
6. [[#Sistema de Autenticação]]
7. [[#Sistema de Licença e Trial]]
8. [[#Páginas — Detalhe Completo]]
9. [[#Bibliotecas Internas (src/lib/)]]
10. [[#Utilitários (src/utils/)]]
11. [[#Base de Dados — localStorage]]
12. [[#Base de Dados — Supabase]]
13. [[#Sistema de Fluxo de Caixa]]
14. [[#SAF-T Angola — Fiscalidade]]
15. [[#Deploy Web — Vercel]]
16. [[#Build Electron — Windows]]
17. [[#PWA — Android e Mac]]
18. [[#Credenciais Padrão]]
19. [[#Comandos Úteis]]

---

## Visão Geral do Projecto

**Nome:** Peixaria Khrismir  
**Versão:** 1.5.0  
**Empresa:** Peixaria Khrismir, Lubango, Huíla, Angola  
**NIF:** 5001210092  
**Contacto:** +244 929 970 984 | khrismir@gmail.com  
**URL Web (clientes):** https://peixaria-khrismir.vercel.app  
**Vercel Project:** `jorge-dicrensiano-amaral-capondes-projects/peixaria-khrismir`

Sistema de gestão completo de peixaria com:
- Ponto de venda (POS) para funcionários
- Painel de administração completo
- Loja online para clientes (web, Android, Mac)
- Facturação conforme lei angolana (SAF-T/AO, Decreto Presidencial n.º 71/25)
- Fluxo de caixa integrado
- Supabase como base de dados partilhada para clientes online

---

## Stack Tecnológico

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 19.2.3 | Framework UI |
| TypeScript | 5.9.3 | Tipagem estática |
| Vite | 7.2.4 | Build tool |
| Tailwind CSS | 4.1.17 | Estilos |
| React Router DOM | 7.13.2 | Navegação (HashRouter) |
| Zustand | 5.0.12 | Estado global (Auth) |
| Supabase JS | 2.100.1 | Base de dados cloud + Auth |
| CryptoJS | 4.2.0 | SHA-256 (passwords, hashes AGT) |
| Recharts | 3.8.1 | Gráficos no Admin |
| XLSX | 0.18.5 | Exportação Excel |
| date-fns | 4.1.0 | Formatação de datas |
| qrcode.react | 4.2.0 | QR codes |
| sonner | 2.0.7 | Toasts/notificações UI |
| Electron | 41.1.1 | Empacotamento desktop Windows |
| electron-builder | 26.8.1 | Build do instalador .exe |
| vite-plugin-singlefile | 2.3.0 | Inlining para Electron |

---

## Arquitectura — Dois Modos

### Modo Electron (PC da loja — Admin/POS)
```
npm run build        → vite.config.ts (singlefile, base: "./")
                     → dist/index.html  (único ficheiro, tudo inline)
npm run electron:build → empacota em release/*.exe
```
- Funciona **sem internet** (offline-first via localStorage)
- Usa `HashRouter` (necessário para `file://` protocol)
- Dados guardados em `localStorage` do Chromium embutido
- Quando Supabase disponível, sincroniza automaticamente
- O admin e funcionários usam esta versão

### Modo Web (Vercel — Clientes)
```
npm run build:web    → vite.config.web.ts (sem singlefile, base: "/")
                     → dist-web/ (ficheiros separados com hash)
vercel deploy --prod → https://peixaria-khrismir.vercel.app
```
- Ligado ao Supabase (dados partilhados com o Electron)
- PWA instalável no Android e Mac
- Clientes usam: Catálogo, Carrinho, Encomendas, Perfil
- Routing: HashRouter (sem necessidade de rewrites no Vercel)

### Fluxo de Dados
```
Electron (Admin/POS)
  └── localStorage (primário)
  └── Supabase (sincronização)
        ↕ (Realtime)
Vercel Web (Clientes)
  └── Supabase (primário)
  └── localStorage (cache)
```

---

## Estrutura de Ficheiros

```
peixaria-khrismir-web-app 1.5 - Cópia/
│
├── src/
│   ├── App.tsx                   ← Rotas principais + protecção
│   ├── main.tsx                  ← Boot: sessão Supabase + pullAll() + SW
│   ├── index.css                 ← Estilos globais Tailwind
│   │
│   ├── components/
│   │   └── Header.tsx            ← Navbar + bell de notificações
│   │
│   ├── pages/
│   │   ├── Landing.tsx           ← Página inicial pública
│   │   ├── Auth.tsx              ← Login/Registo/Reset (Supabase + localStorage)
│   │   ├── Activation.tsx        ← Ecrã de activação de licença
│   │   ├── Catalog.tsx           ← Catálogo de produtos (clientes)
│   │   ├── Cart.tsx              ← Carrinho + checkout (clientes)
│   │   ├── Orders.tsx            ← Histórico de encomendas + Realtime
│   │   ├── Profile.tsx           ← Perfil do utilizador
│   │   ├── POS.tsx               ← Ponto de venda (funcionários)
│   │   ├── Admin.tsx             ← Painel admin completo (17 tabs)
│   │   ├── CashFlow.tsx          ← Fluxo de caixa completo
│   │   ├── _TurnoTab.tsx         ← Gestão de turnos (exportado para CashFlow)
│   │   ├── Verify.tsx            ← Verificação de email
│   │   └── NotFound.tsx          ← 404
│   │
│   ├── lib/
│   │   ├── supabase.ts           ← Cliente Supabase + isSupabaseReady()
│   │   ├── sync.ts               ← pullAll(), pushAll(), syncOrder(), etc.
│   │   ├── cashflow.ts           ← Integração financeira central
│   │   ├── settings.ts           ← Configurações da loja (localStorage)
│   │   ├── license.ts            ← Sistema de trial 30 dias + chave de licença
│   │   └── notifications.ts      ← Bell de pedidos + polling + browser notifications
│   │
│   ├── stores/
│   │   └── useAuthStore.ts       ← Zustand store com persistência
│   │
│   ├── types/
│   │   └── database.ts           ← Todos os tipos TypeScript
│   │
│   ├── utils/
│   │   ├── saft.ts               ← SAF-T/AO XML + hash AGT encadeado
│   │   ├── invoice.ts            ← Impressão de fatura/recibo HTML
│   │   └── seed.ts               ← Dados iniciais de exemplo
│   │
│   └── routes/
│       └── ProtectedRoutes.tsx   ← Guards de rota
│
├── public/
│   ├── manifest.json             ← PWA manifest
│   ├── sw.js                     ← Service Worker (cache offline)
│   └── icon.svg                  ← Ícone da app
│
├── supabase/
│   ├── schema.sql                ← Schema completo da base de dados
│   └── migrations/               ← Migrações SQL
│
├── electron/
│   └── main.cjs                  ← Processo principal Electron
│
├── .env                          ← Variáveis Supabase (NÃO commitar)
├── vite.config.ts                ← Config Electron (singlefile)
├── vite.config.web.ts            ← Config Web/Vercel (sem singlefile)
├── vercel.json                   ← Config deploy Vercel
├── package.json                  ← Scripts e dependências
└── supabase/schema.sql           ← Schema da base de dados
```

---

## Rotas da Aplicação

Todas as rotas usam `HashRouter` → URLs no formato `/#/rota`

| Rota | Página | Acesso |
|---|---|---|
| `/` | Landing | Público |
| `/auth` | Auth (login/registo) | Público (redirige se autenticado) |
| `/verify` | Verify (email) | Público |
| `/catalog` | Catálogo | Autenticado |
| `/cart` | Carrinho | Autenticado |
| `/orders` | Encomendas | Autenticado |
| `/profile` | Perfil | Autenticado |
| `/pos` | POS | Staff (admin/employee) |
| `/admin/*` | Admin | Apenas admin |
| `/cashflow` | Fluxo de Caixa | Staff (admin/employee) |

### Guards de Rota
- `Protected` — qualquer utilizador autenticado
- `StaffRoute` — admin ou employee (clientes são redirigidos para /catalog)
- `AdminRoute` — apenas role === 'admin'

---

## Sistema de Autenticação

**Ficheiro:** `src/stores/useAuthStore.ts`  
**Persistência:** Zustand `persist` middleware → `khrismir_auth_storage` (localStorage)

### Fluxo de Login
1. Tenta autenticar via **Supabase Auth** (`supabase.auth.signInWithPassword`)
2. Se Supabase falhar → fallback para **localStorage** (`khrismir_clients`)
3. Bloqueio após 5 tentativas falhadas por 15 minutos

### Utilizadores Padrão (localStorage — sempre criados no arranque)
| Email | Password | Role |
|---|---|---|
| `admin@khrismir.ao` | `admin123` | admin |
| `funcionario@khrismir.ao` | `func123` | employee |

> Passwords guardadas com SHA-256 (`CryptoJS.SHA256(password).toString()`)

### Registo de Clientes
- Via Supabase Auth (`supabase.auth.signUp`)
- Trigger SQL cria perfil em `profiles` automaticamente
- Role padrão: `client`

### Restaurar Sessão
- `initSupabaseSession()` chamado em `main.tsx` no boot
- Restaura sessão Supabase se existir token válido
- `onAuthStateChange` ouve logout automático (token expirado)

---

## Sistema de Licença e Trial

**Ficheiro:** `src/lib/license.ts`

### Funcionamento
- **Trial:** 30 dias a contar da primeira abertura (data guardada em `khrismir_install_date`)
- **Licença:** chave `KHRIS-XXXX-YYYY-ZZZZ` guardada em `khrismir_license`
- Se trial expirado E sem licença válida → mostra `Activation.tsx`

### Formato da Chave
```
KHRIS-AAAA-BBBB-CCCC
onde CCCC = (soma dos char codes de AAAA+BBBB % 10000).padStart(4,'0')
```

### Gerar Chave (consola do browser)
```js
// Abrir DevTools → Console e escrever:
window.__genKey('AAAA', 'BBBB')
// Exemplo: KHRIS-AAAA-BBBB-3136
```

### Funções Exportadas
```ts
isAppActive()       → boolean  // trial OU licença válida
isTrialActive()     → boolean  // dias restantes > 0
isLicenseValid()    → boolean  // chave guardada e válida
getDaysRemaining()  → number   // dias restantes do trial
activateLicense(key) → boolean // guarda e valida a chave
```

---

## Páginas — Detalhe Completo

### `Landing.tsx`
Página inicial pública com apresentação da peixaria, horários, contactos e botões de CTA (Entrar / Registar).

### `Auth.tsx`
- Login via Supabase ou localStorage
- Registo de novos clientes via Supabase
- Reset de password (Supabase email ou código local)
- Bloqueio por tentativas excessivas

### `Activation.tsx`
Mostrado quando o trial expirou ou não há licença. Input para chave `KHRIS-XXXX-XXXX-XXXX`. Botão para continuar em trial se ainda ativo.

### `Catalog.tsx`
- Lista produtos com filtro por categoria e pesquisa
- Modal para escolher preparação (inteiro/limpo/filé/posta)
- Adiciona ao carrinho (localStorage `khrismir_cart`)
- `pullAll()` ao montar → dados frescos do Supabase

### `Cart.tsx`
- Gestão do carrinho (quantidade, remover)
- Tipos de entrega: Retirada / Delivery
- Zonas de entrega com preços
- Formas de pagamento: Multicaixa / Express / Dinheiro
- **Selector de banco de destino** quando pagamento é Multicaixa
- Códigos promocionais com validação
- Checkout:
  - Cria `Order` com hash AGT (`calcOrderHash`)
  - Guarda em `khrismir_orders`
  - Chama `syncOrder()` → Supabase (admin vê em tempo real)
  - Chama `registerSaleMovement()` → Fluxo de Caixa
  - Notifica via WhatsApp

### `Orders.tsx`
- Lista encomendas do utilizador (filtradas por `customer_id`)
- Botão "Actualizar" com spinner
- **Supabase Realtime** → estado actualiza automaticamente quando admin muda
- `pullAll()` ao montar → dados frescos
- Impressão de fatura/recibo
- Link WhatsApp para perguntar estado

### `Profile.tsx`
Dados do utilizador, histórico resumido.

### `POS.tsx`
Ponto de venda para funcionários:
- Grid de produtos com pesquisa e filtro por categoria
- Modal de peso + preparação por produto
- Carrinho lateral com totais
- **Verificação de turno aberto** (bloqueia venda se não houver turno)
- Pagamento: Multicaixa / Express / Dinheiro
- **Selector de banco de destino** para Multicaixa
- Códigos promocionais
- Checkout:
  - Cria `Order` com status `pronto`
  - Desconta stock em `khrismir_products`
  - Chama `registerSaleMovement(total, orderNumber, paymentType, orderId, bankAccount)`
  - Pontos de fidelização (1 ponto / 1000 AOA) para clientes identificados
- Recibo/QR code após venda
- Impressão de fatura via `printInvoice()`

### `Admin.tsx`
17 tabs de gestão completa:

| Tab | Descrição |
|---|---|
| **Visão Geral** | Dashboard com KPIs, gráficos 7 dias, pagamentos, alertas stock/validade, QR code partilha |
| **Encomendas** | Lista/filtro, mudança de estado, `syncOrderStatus()`, WhatsApp, impressão fatura |
| **Produtos** | CRUD, custo, validade, preparações permitidas |
| **Categorias** | CRUD de categorias |
| **Equipa** | Gestão de funcionários com passwords SHA-256 |
| **Clientes** | Lista de clientes registados |
| **Financeiro** | Resumo `getCashFlowSummary()`, saldos por conta, link para CashFlow |
| **Compras/Stock** | Entrada de stock, actualiza produto, regista em CashFlow, exporta Excel |
| **Fornecedores** | CRUD de fornecedores (`khrismir_suppliers`) |
| **Devoluções** | Registo de devoluções, reposição de stock |
| **Fidelização** | Pontos por cliente, histórico de transacções |
| **Calendário** | Vista de entregas por data |
| **Zonas Entrega** | CRUD de zonas com preços |
| **Promoções** | CRUD de códigos promocionais |
| **AGT / Fiscal** | Export SAF-T XML, balanço mensal Excel, hash count |
| **Configurações** | Dados da loja, NIF, IVA, WhatsApp, delivery |
| **Sistema** | Import/Export JSON, reset, `pushAll()` para Supabase |

**QR Code na Visão Geral:**
- Cartão "Partilhar App com Clientes" → URL: `https://peixaria-khrismir.vercel.app`
- Modal com QR code (logo no centro), instruções Android/iPhone/Mac
- Botão imprimir (página HTML limpa para impressão)
- Botão copiar link

### `CashFlow.tsx`
6 tabs completas:
- **Turno** → `_TurnoTab.tsx` (abertura/fecho de turno)
- **Dashboard** → KPIs, gráficos por período
- **Movimentos** → lista completa, filtros, CRUD
- **Contas** → gestão de contas (caixa/banco/mobile)
- **Categorias** → categorias de movimento
- **Relatórios** → exportação Excel por período

Ao montar: `migrateExistingData()` + `syncAllData()` → garante dados completos.

### `_TurnoTab.tsx`
Exporta dois elementos:
- `getOpenShift()` → lê `khrismir_shifts`, retorna turno aberto ou `null`
- `TurnoTab` → componente React com abertura/fecho de turno

**Abertura:** saldo inicial em AOA  
**Fecho:** dinheiro contado, calcula diferença esperado vs. contado, alerta se diferença > 100 AOA  
**POS bloqueia vendas** se `getOpenShift()` retornar `null`

---

## Bibliotecas Internas (src/lib/)

### `supabase.ts`
```ts
export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
export const isSupabaseReady = () => !!url && !!key && url !== 'placeholder'
```
URL do projecto: `https://lsntuvzlxsdaofrgvjio.supabase.co`

### `sync.ts`
Camada de sincronização Supabase ↔ localStorage:

```ts
pullAll()                    → Supabase → localStorage (todas as tabelas)
pushAll()                    → localStorage → Supabase (migração inicial)
syncOrder(order)             → guarda encomenda no Supabase
syncOrderStatus(id, status)  → actualiza estado no Supabase
syncProducts(products)       → sincroniza produtos
syncCategories(categories)   → sincroniza categorias
syncSettings(settings)       → sincroniza configurações
syncDeliveryZones(zones)     → sincroniza zonas
syncPromos(promos)           → sincroniza promoções
deleteProduct(id)            → apaga produto do Supabase
deleteCategory(id)           → apaga categoria do Supabase
```

Todas as funções verificam `isSupabaseReady()` antes de executar — falham silenciosamente no Electron sem internet.

### `cashflow.ts`
Integração financeira central:

```ts
registerSaleMovement(amount, orderNumber, paymentType, orderId?, chosenAccount?)
  → cria movimento 'income' em cf_movements
  → ID determinístico: sync-sale-{orderId}
  → guarda conta bancária escolhida (para Multicaixa)
  → actualiza saldo da conta

registerPurchaseMovement(amount, productName, supplier, accountName?, purchaseId?)
  → cria movimento 'expense' em cf_movements
  → ID determinístico: sync-pur-{purchaseId}
  → actualiza saldo da conta

syncAllData()
  → lê todos os khrismir_orders (excl. cancelados)
  → lê todos os khrismir_purchases
  → cria entradas em cf_movements que não existam ainda
  → idempotente (verifica por ID e por reference field)

migrateExistingData(force?)
  → migração única (flag cf_migration_done_v1)
  → converte khrismir_cashflow → cf_movements
  → converte khrismir_purchases → cf_movements

getCashFlowSummary()
  → { totalBalance, todayIncome, todayExpense,
      monthIncome, monthExpense,
      recentSales, recentExpenses, accounts }
```

**Lógica anti-duplicação:**
- IDs determinísticos (`sync-sale-{id}`, `sync-pur-{id}`)
- Verifica campo `reference` (order_number) antes de criar
- `existingRefs` set previne duplicação de vendas POS

### `settings.ts`
```ts
getSettings() → StoreSettings   // lê khrismir_settings, merge com defaults
saveSettings(s) → void          // guarda khrismir_settings
```
Defaults: nome, telefone, WhatsApp, email, morada, NIF 5001210092, IVA 14%

### `license.ts`
Ver secção [[#Sistema de Licença e Trial]] acima.

### `notifications.ts`
```ts
getPendingOrderCount()                  → número de pedidos 'pendente'
requestNotificationPermission()         → pede permissão browser notifications
notifyNewOrder(orderNumber)             → mostra notificação do sistema
startOrderPolling(onNewOrder)           → polling cada 10s, retorna cleanup fn
```
Usado pelo `Header.tsx` para o ícone de sino com badge vermelho.

---

## Utilitários (src/utils/)

### `saft.ts`
Implementa SAF-T/AO 1.01.01 conforme Decreto Presidencial n.º 71/25 e n.º 312/18.

**Hash de autenticação AGT:**
```ts
calcInvoiceHash(invoiceDate, systemEntryDate, invoiceNo, grossTotal, prevHash)
  → SHA-256("date;systemDate;invoiceNo;grossTotal;prevHash")
  → extrai hex[0] + hex[10] + hex[20] + hex[30]
  → resultado: string de 4 caracteres hex

calcOrderHash(order)
  → lê hash da última factura (getLastInvoiceHash)
  → calcula e retorna hash encadeado

generateSAFTXML(orders, settings, year?)
  → gera XML completo com namespace AO_1.01_01
  → recalcula cadeia de hashes completa para integridade
  → inclui: Header, MasterFiles (tabela IVA), SalesInvoices

downloadSAFT(xml, nif, year)
  → faz download do ficheiro SAF-T_AO_{NIF}_{ANO}.xml
```

**Estrutura XML:**
```xml
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>...</Header>              ← dados empresa + período
  <MasterFiles><TaxTable>...</TaxTable></MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
      <Invoice>
        <Hash>XXXX</Hash>           ← 4 chars do SHA-256 encadeado
        <HashControl>1</HashControl>
        <Period>1-12</Period>
        ...linhas de produto...
      </Invoice>
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>
```

### `invoice.ts`
```ts
printInvoice(order, settings)
  → abre janela nova com HTML da fatura
  → chama window.print() após 500ms
  → inclui: logo, dados cliente, tabela itens, totais, IVA
  → rodapé: Hash AGT, HashControl, SAF-T/AO 1.01.01, Dec. Pres. n.º 71/25
```

---

## Base de Dados — localStorage

Todas as chaves usadas pela aplicação:

| Chave | Conteúdo | Quem usa |
|---|---|---|
| `khrismir_orders` | `Order[]` | POS, Cart, Admin, Orders |
| `khrismir_products` | `Product[]` | POS, Catalog, Admin |
| `khrismir_categories` | `Category[]` | Catalog, Admin |
| `khrismir_employees` | `User[]` | Admin |
| `khrismir_clients` | `User[]` (com password) | Auth |
| `khrismir_purchases` | `Purchase[]` | Admin PurchasesTab |
| `khrismir_suppliers` | `Supplier[]` | Admin SuppliersTab |
| `khrismir_shifts` | `ShiftSession[]` | TurnoTab, POS |
| `khrismir_returns` | `Return[]` | Admin ReturnsTab |
| `khrismir_loyalty` | `LoyaltyTransaction[]` | POS, Admin LoyaltyTab |
| `khrismir_promos` | `PromoCode[]` | Cart, POS, Admin |
| `khrismir_delivery_zones` | `DeliveryZone[]` | Cart, Admin |
| `khrismir_settings` | `StoreSettings` | settings.ts |
| `khrismir_cashflow` | `CashFlow[]` (formato antigo) | legado, migrado |
| `khrismir_cart` | `CartItem[]` | Cart |
| `khrismir_pos_cart` | `POSCartItem[]` | POS |
| `khrismir_auth_storage` | sessão Zustand | useAuthStore |
| `khrismir_license` | chave de licença | license.ts |
| `khrismir_install_date` | data instalação (trial) | license.ts |
| `khrismir_login_attempts` | tentativas falhadas | useAuthStore |
| `khrismir_resets` | códigos reset password | useAuthStore |
| `cf_movements` | `CFMovement[]` | cashflow.ts, CashFlow |
| `cf_accounts` | `CFAccount[]` | cashflow.ts, CashFlow |
| `cf_categories` | categorias CF | CashFlow |
| `cf_migration_done_v1` | flag migração única | cashflow.ts |

---

## Base de Dados — Supabase

**URL:** `https://lsntuvzlxsdaofrgvjio.supabase.co`  
**Ficheiro schema:** `supabase/schema.sql`

### Tabelas

| Tabela | Descrição |
|---|---|
| `profiles` | Perfis de utilizadores (id = auth.users.id) |
| `categories` | Categorias de produtos |
| `products` | Produtos com stock, preços, preparações |
| `orders` | Encomendas |
| `order_items` | Itens das encomendas (FK → orders) |
| `cash_flow` | Movimentos de caixa (formato legado) |
| `purchases` | Compras/entradas de stock |
| `delivery_zones` | Zonas de entrega com preços |
| `promo_codes` | Códigos promocionais |
| `store_settings` | Configurações da loja (1 registo, id=1) |

### Row Level Security (RLS)

| Regra | Quem |
|---|---|
| Categorias/Produtos → SELECT | Qualquer autenticado |
| Categorias/Produtos → ALL | staff (admin/employee) |
| Encomendas → SELECT | próprio cliente OU staff |
| Encomendas → INSERT | qualquer autenticado |
| Encomendas → UPDATE | apenas staff |
| Financeiro/Compras → ALL | apenas staff |
| Settings → SELECT | qualquer autenticado |
| Settings → ALL | apenas admin |

### Realtime
Publicação configurada para: `orders`, `order_items`, `products`, `categories`, `delivery_zones`, `promo_codes`, `cash_flow`, `purchases`

**Usado em `Orders.tsx`:**
```ts
supabase.channel('orders-realtime')
  .on('postgres_changes', { event: 'UPDATE', table: 'orders' }, payload => {
    // actualiza estado da encomenda no ecrã automaticamente
  })
  .subscribe()
```

### Trigger Automático
```sql
-- Cria perfil quando utilizador se regista
create trigger on_auth_user_created
  after insert on auth.users
  execute procedure handle_new_user();
```

---

## Sistema de Fluxo de Caixa

Arquitectura de duas camadas:

### Camada 1 — `cf_movements` (nova)
- Fonte de verdade para o painel de Fluxo de Caixa
- IDs determinísticos para evitar duplicados:
  - Vendas POS: `sync-sale-{orderId}`
  - Compras: `sync-pur-{purchaseId}`
  - Migração antiga: `migcf-{id}`, `migpur-{id}`
- `syncAllData()` garante que todos os pedidos e compras têm entrada correspondente

### Camada 2 — `khrismir_cashflow` (legado)
- Formato antigo (entrada/saída simples)
- Migrado para `cf_movements` por `migrateExistingData()` (corre 1 vez)

### Contas (`cf_accounts`)
Tipos: `cash` | `bank` | `mobile`
- **Para Multicaixa:** mostra selector de banco nos ecrãs de venda (POS e Cart)
- `accountForPayment()` tenta match automático quando não há conta escolhida

### Selector de Banco (Multicaixa)
Quando o pagamento é Multicaixa e existem contas do tipo `bank` em `cf_accounts`:
- POS → dropdown aparece abaixo dos botões de pagamento
- Cart → dropdown aparece na secção de pagamento
- Banco escolhido é passado ao `registerSaleMovement(..., chosenAccount)`

---

## SAF-T Angola — Fiscalidade

**Base legal:** Decreto Presidencial n.º 71/25 (faturação) e n.º 312/18 (SAF-T)  
**Schema XML:** `urn:OECD:StandardAuditFile-Tax:AO_1.01_01`  
**Ficheiro gerado:** `SAF-T_AO_{NIF}_{ANO}.xml`

### Hash Encadeado (4 chars SHA-256)
Cada factura tem um hash calculado com base na factura anterior:
```
hash = SHA256("data;dataEntrada;numFactura;totalBruto;hashAnterior")
caracteres extraídos: hex[0], hex[10], hex[20], hex[30]
```
- Primeira factura usa `prevHash = '0'`
- `generateSAFTXML()` recalcula a cadeia completa ao exportar (garante integridade mesmo se hashes faltarem)
- Hash guardado no campo `order.hash` de cada encomenda

### IVA
- Taxa padrão: 14% (configurável)
- Separação net/gross em cada factura
- `NetTotal = GrossTotal / (1 + taxaIVA)`
- `TaxPayable = GrossTotal × taxaIVA / (1 + taxaIVA)`

### Exportação (Admin → AGT / Fiscal)
1. Seleccionar ano
2. Clique em "Exportar SAF-T XML"
3. Descarrega `SAF-T_AO_5001210092_2025.xml`
4. Balanço mensal Excel também disponível

---

## Deploy Web — Vercel

**Projecto:** `jorge-dicrensiano-amaral-capondes-projects/peixaria-khrismir`  
**URL produção:** https://peixaria-khrismir.vercel.app  
**Config:** `vercel.json`

```json
{
  "buildCommand": "npm run build:web",
  "outputDirectory": "dist-web",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Variáveis de Ambiente (Vercel)
```
VITE_SUPABASE_URL       = https://lsntuvzlxsdaofrgvjio.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJhbGciOiJIUzI1NiIs...
```
> Estas variáveis são públicas (anon key). São injectadas no bundle em build time.

### Fazer Novo Deploy
```bash
cd "peixaria-khrismir-web-app 1.5 - Cópia"
vercel deploy --prod \
  --build-env VITE_SUPABASE_URL=https://lsntuvzlxsdaofrgvjio.supabase.co \
  --build-env "VITE_SUPABASE_ANON_KEY=eyJ..."
```

### Build Web (sem Vercel)
```bash
npm run build:web
# output: dist-web/
```
Usa `vite.config.web.ts`: sem `vite-plugin-singlefile`, `base: "/"`, chunks separados (vendor, supabase, charts, index).

---

## Build Electron — Windows

### Build Completo (web + exe)
```bash
npm run electron:build
# 1. vite build → dist/index.html (singlefile)
# 2. node build-app.mjs → release/
```

### Apenas empacotar (se dist/ já existe)
```bash
npm run electron:pack
```

### Desenvolvimento
```bash
npm run dev          # servidor Vite
npm run electron:dev # Electron apontando ao dev server
```

### Output
```
release/
  ├── PeixariaKhrismir Setup 1.5.0.exe   ← instalador NSIS
  └── PeixariaKhrismir-Portatil-1.5.0.exe ← portátil (sem instalação)
```

### Config Electron Builder (`package.json → build`)
- AppId: `ao.khrismir.peixaria`
- NSIS: em português europeu, atalho desktop, menu iniciar
- Portátil: ficheiro único
- Arquitectura: x64
- Execution level: `asInvoker` (sem admin)

### Config Electron (`electron/main.cjs`)
- Abre `dist/index.html` directamente (file:// protocol)
- HashRouter compatível com file://

---

## PWA — Android e Mac

**Manifest:** `public/manifest.json`
```json
{
  "name": "Peixaria Khrismir",
  "short_name": "Khrismir",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0891b2",
  "background_color": "#f0f9ff"
}
```

**Service Worker:** `public/sw.js`
- Cache: `khrismir-v1`
- Estratégia: cache-first, actualiza em background
- Cobre: GET requests de recursos estáticos

**Registo:** `src/main.tsx`
```ts
navigator.serviceWorker.register('/sw.js')
```

### Instalação nos Dispositivos

| Dispositivo | Passos |
|---|---|
| **Android (Chrome)** | Abrir https://peixaria-khrismir.vercel.app → Menu ⋮ → "Adicionar ao ecrã inicial" |
| **iPhone (Safari)** | Abrir URL → Partilhar → "Adicionar ao ecrã de início" |
| **Mac (Chrome)** | Abrir URL → Ícone ⊕ na barra de endereço → Instalar |
| **Mac (Safari)** | Abrir URL → Ficheiro → "Adicionar ao Dock" |

### QR Code para Clientes
Disponível em **Admin → Visão Geral → "Partilhar App com Clientes"**:
- Mostra QR code com logo da peixaria no centro
- Botão imprimir (página HTML limpa)
- Botão copiar link
- Instruções por dispositivo

---

## Credenciais Padrão

### App (localStorage)
| Utilizador | Email | Password | Acesso |
|---|---|---|---|
| Administrador | admin@khrismir.ao | admin123 | Tudo |
| Funcionário | funcionario@khrismir.ao | func123 | POS + CashFlow |

### Supabase Dashboard
Aceder via: https://supabase.com → projecto `lsntuvzlxsdaofrgvjio`

### Vercel Dashboard
Aceder via: https://vercel.com → projecto `peixaria-khrismir`

---

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev                    # servidor web local (porta 5173)
npm run electron:dev           # Electron em modo dev

# Build
npm run build                  # build Electron (singlefile → dist/)
npm run build:web              # build web (multi-chunk → dist-web/)
npm run electron:build         # build + empacotar exe
npm run electron:pack          # apenas empacotar (sem rebuild)

# Deploy
vercel deploy --prod [...]     # deploy para produção Vercel

# Supabase
npx supabase db push           # aplicar migrações ao Supabase
npx supabase db diff           # ver diferenças
```

### Gerar Chave de Licença (DevTools)
```js
// Na consola do browser:
window.__genKey('AAAA', 'BBBB')
// Resultado: KHRIS-AAAA-BBBB-3136
```

### Reset de Dados (DevTools)
```js
// Limpar tudo:
Object.keys(localStorage).filter(k=>k.startsWith('khrismir')).forEach(k=>localStorage.removeItem(k))
// Limpar só encomendas:
localStorage.removeItem('khrismir_orders')
// Forçar re-migração do cashflow:
localStorage.removeItem('cf_migration_done_v1')
```

---

## Tipos TypeScript Principais

Definidos em `src/types/database.ts`:

```ts
type UserRole = 'admin' | 'employee' | 'client'
type OrderStatus = 'pendente'|'confirmado'|'preparando'|'pronto'|'entregue'|'cancelado'
type PaymentType = 'multicaixa' | 'express' | 'dinheiro'
type DeliveryType = 'retirada' | 'delivery'
type PreparationType = 'inteiro' | 'limpo' | 'filé' | 'posta'

interface Product {
  id, name, price, cost_price?, unit, stock_quantity, min_stock,
  allow_whole, allow_clean, allow_fillet, allow_steak,
  category_id, image_url?, expiry_date?, created_at?
}

interface Order {
  id, order_number, customer_id?, customer_name?, customer_phone?, customer_nif?,
  status, payment_type, delivery_type, delivery_zone?, delivery_fee?,
  delivery_address?, discount_code?, discount_amount?,
  subtotal?, total, items: OrderItem[], notes?, created_at, updated_at?, hash?
}

interface ShiftSession {
  id, opened_at, closed_at?, opening_balance, closing_balance?,
  cash_counted?, difference?, opened_by, closed_by?, notes?
}
```

---

*Documentação gerada em 2026-05-04. Versão do app: 1.5.0*  
*Actualizar este ficheiro sempre que houver alterações significativas na arquitectura ou funcionalidades.*
