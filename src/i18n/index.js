export const DEFAULT_LANGUAGE = 'pt-BR';

export const SUPPORTED_LANGUAGES = Object.freeze([
  Object.freeze({ code: 'pt-BR', label: 'Português (Brasil)' }),
  Object.freeze({ code: 'en', label: 'English' }),
]);

const PT_BR = Object.freeze({
  'Industrial Intelligence Portal · Cutting Plan Optimize': 'Portal de Inteligência Industrial · Otimizador de Plano de Corte',
  'New': 'Novo',
  'Engineering': 'Engenharia',
  'Equipment': 'Equipamento',
  'Equipments': 'Equipamentos',
  'Drawings': 'Desenhos',
  'Procurement': 'Suprimentos',
  'PO & Receiving': 'Pedidos e Recebimento',
  'Inventory': 'Estoque',
  'Stock & Reservations': 'Estoque e Reservas',
  'Fabrication': 'Fabricação',
  'Material Coupons': 'Cupons de Material',
  'Cutting Sheets': 'Folhas de Corte',
  'Return Material Vouchers': 'Vales de Devolução de Material',
  'Genealogy': 'Genealogia',
  'Traceability Search': 'Pesquisa de Rastreabilidade',
  'Reports': 'Relatórios',
  'Admin': 'Administração',
  'Projects': 'Projetos',
  'Document Register': 'Registro de Documentos',
  'Audit': 'Auditoria',
  'Audit History': 'Histórico de Auditoria',
  'Data Quality': 'Qualidade dos Dados',
  'Users': 'Usuários',
  'Settings': 'Configurações',
  'Archive': 'Arquivo',
  'Fabrication Portal': 'Portal de Fabricação',
  'Search plans and materials...': 'Buscar planos e materiais...',
  'Search': 'Buscar',
  'Select active project': 'Selecionar projeto ativo',
  'No project selected': 'Nenhum projeto selecionado',
  'View all projects': 'Ver todos os projetos',
  'Active user options': 'Opções do usuário ativo',
  'Main navigation': 'Navegação principal',
  'Language': 'Idioma',
  'Application language': 'Idioma do aplicativo',
  'The choice is applied to the application and saved in this browser.': 'A escolha é aplicada ao aplicativo e fica salva neste navegador.',
  'Cancel': 'Cancelar',
  'Settings saved.': 'Configurações salvas.',
  'Master Data': 'Dados Mestres',
  'Project Manager': 'Gerenciador de Projetos',
  'Register structured projects and track their linked equipment.': 'Cadastre projetos estruturados e acompanhe seus equipamentos vinculados.',
  'Register': 'Cadastrar',
  'Edit': 'Editar',
  'Duplicate': 'Duplicar',
  'Delete': 'Excluir',
  'Refresh': 'Atualizar',
  'All projects': 'Todos os projetos',
  'All equipment': 'Todos os equipamentos',
  'All drawings': 'Todos os desenhos',
  'All statuses': 'Todos os status',
  'All types': 'Todos os tipos',
  'All priorities': 'Todas as prioridades',
  'All areas': 'Todas as áreas',
  'Actions': 'Ações',
  'Quantity': 'Quantidade',
  'Configuration': 'Configuração',
  'Location / Service': 'Local / Serviço',
  'Equipment group': 'Grupo de equipamento',
  'Design Drawing': 'Desenho de Projeto',
  'Shop Drawings': 'Desenhos de Fabricação',
  'Status': 'Status',
  'Title': 'Título',
  'Project': 'Projeto',
  'Priority': 'Prioridade',
  'Progress': 'Progresso',
  'Type': 'Tipo',
  'Revision': 'Revisão',
  'Link': 'Vínculo',
  'Discipline': 'Disciplina',
  'Total Shop Drawings': 'Total de Desenhos de Fabricação',
  'By Status': 'Por Status',
  'By Discipline': 'Por Disciplina',
  'Plan and manage fabrication work packages linked to projects, equipment, drawings and execution activities.': 'Planeje e gerencie pacotes de fabricação vinculados a projetos, equipamentos, desenhos e atividades de execução.',
  'Register Technical Office Shop Drawings; the Design Drawing reference comes from the Equipment.': 'Cadastre os Desenhos de Fabricação do Technical Office; a referência do Desenho de Projeto vem do Equipamento.',
  'Material Management': 'Gestão de Materiais',
  'Material Coupon Management': 'Gestão de Cupons de Material',
  'Traceability, issuance, balance control and physical reservation of offshore materials.': 'Rastreabilidade, emissão, controle de saldo e reserva física de materiais offshore.',
  'Manager and Editor': 'Gerenciador e Editor',
  'Control Database (Issued)': 'Base de Controle (Emitidos)',
  'Export': 'Exportar',
  'New Coupon': 'Novo Cupom',
  'Destination': 'Destino',
  'Material Name': 'Nome do Material',
  'Material Type': 'Tipo de Material',
  'Updated from': 'Atualizado desde',
  'Code, project, destination...': 'Código, projeto, destino...',
  'Search Material Coupons': 'Buscar Cupons de Material',
  'Back': 'Voltar',
  'No coupon selected': 'Nenhum cupom selecionado',
  'Create or select a Material Coupon.': 'Crie ou selecione um Cupom de Material.',
  'Save Draft': 'Salvar Rascunho',
  'Print / Save PDF': 'Imprimir / Salvar PDF',
  'More actions': 'Mais ações',
  'Refresh Local': 'Atualizar Local',
  'Link Workpack': 'Vincular Workpack',
  'Submit': 'Enviar',
  'Approve': 'Aprovar',
  'Reject': 'Rejeitar',
  'Dispatch': 'Despachar',
  'Receive': 'Receber',
  'Close': 'Fechar',
  'Reopen': 'Reabrir',
  'Release Reservations': 'Liberar Reservas',
  'Cancel Coupon': 'Cancelar Cupom',
  'New Revision': 'Nova Revisão',
  'Export Extract': 'Exportar Extrato',
  'Export Excel': 'Exportar Excel',
  'Configure Template': 'Configurar Modelo',
  'Delete Coupon': 'Excluir Cupom',
  'Coupon and Project Data': 'Dados do Cupom e do Projeto',
  'Materials': 'Materiais',
  'Signatures': 'Assinaturas',
  'Reference and Notes': 'Referência e Observações',
  'Document Preview': 'Pré-visualização do Documento',
  'Document Register — Issued Materials': 'Registro de Documentos — Materiais Emitidos',
  'Issued Material Coupon lines enriched with RMVs linked to the source material.': 'Linhas dos Cupons de Material emitidos, enriquecidas pelos RMVs vinculados ao material de origem.',
  'Governance': 'Governança',
  'Consult document types and records already available in the system.': 'Consulte tipos de documentos e os registros já existentes no sistema.',
  'Return Material': 'Devolução de Material',
  'Manage offcuts, material disposition and Return Material Vouchers in a single flow.': 'Gerencie retalhos, disposição de materiais e Vales de Devolução de Material em um único fluxo.',
  'Consult local import, reservation, consumption, document issuance and offcut return events.': 'Consulte eventos locais de importação, reserva, consumo, emissão documental e retorno de retalhos.',
  'Review inconsistent IDs, links and snapshots before they affect documents, materials or traceability.': 'Revise IDs, vínculos e snapshots inconsistentes antes que afetem documentos, materiais ou rastreabilidade.',
  'New Cutting Sheet': 'Nova Folha de Corte',
  'Cutting Sheet Results': 'Resultados da Folha de Corte',
  'Open results': 'Abrir resultados',
  'Save': 'Salvar',
  'Save as new': 'Salvar como novo',
  'Load Cutting Sheet': 'Carregar Folha de Corte',
  'Active project': 'Projeto ativo',
  'Select a project to fill in the plan data.': 'Selecione um projeto para preencher os dados do plano.',
  'Select Project': 'Selecionar Projeto',
  'Project Data': 'Dados do Projeto',
  'Cutting Sheet identification': 'Identificação da Folha de Corte',
  'Cutting Sheet number': 'Número da Folha de Corte',
  'Select a Workpack': 'Selecione um Workpack',
  'Available Stock': 'Estoque Disponível',
  'Bars and offcuts available to compose the plan.': 'Barras e retalhos disponíveis para compor o plano.',
  'Required Parts': 'Peças Requeridas',
  'Cutting parts that will be allocated to the selected bars.': 'Peças de corte que serão alocadas nas barras selecionadas.',
  'Stock Strategy': 'Estratégia de Estoque',
  'Best Fit': 'Melhor Encaixe',
  'Prioritize Offcuts': 'Priorizar Retalhos',
  'Smallest Bars First': 'Menores Barras Primeiro',
  'Enable Trim': 'Habilitar Aparo',
  'Optimize Cutting Plan': 'Otimizar Plano de Corte',
  'Back to edit': 'Voltar para editar',
  'Issue Cutting Sheet': 'Emitir Folha de Corte',
  'Generate Material Coupon': 'Gerar Cupom de Material',
  'Generate RMV': 'Gerar RMV',
  'Review utilization, cuts and leftovers before exporting.': 'Revise o aproveitamento, os cortes e as sobras antes de exportar.',
  'Plan indicators': 'Indicadores do plano',
  'Colored diagram of bars, cuts, kerf and leftovers.': 'Diagrama colorido das barras, cortes, kerf e sobras.',
  'Export results': 'Exportar resultados',
  'Choose the output format for the optimized plan.': 'Escolha o formato de saída do plano otimizado.',
  'Printing': 'Impressão',
  'Visual Report PDF': 'Relatório Visual PDF',
  'Cutting Table PDF': 'Tabela de Cortes PDF',
  'Cutting Sheet PDF': 'Folha de Corte PDF',
  'Excel spreadsheet with calculated nesting data.': 'Planilha Excel com dados calculados do nesting.',
  'Executive summary': 'Resumo executivo',
  'Tabular summary for checking and fabrication.': 'Resumo tabular para conferência e fabricação.',
  'Detailed bar sheet for the workshop.': 'Ficha detalhada por barra para a oficina.',
  'Part Labels': 'Etiquetas das Peças',
  'Pimaco A4 and Letter templates with identification and traceability.': 'Modelos Pimaco A4 e Carta com identificação e rastreabilidade.',
  'Adjustments before printing': 'Ajustes antes da impressão',
  'Choose what is legible inside each cut and the report ink usage.': 'Escolha o que será legível dentro de cada corte e o consumo de tinta do relatório.',
  'Text size': 'Tamanho do texto',
  'Economic B&W': 'Econômico P&B',
  'Gray': 'Cinza',
  'Colored': 'Colorido',
  'Last saved': 'Último salvamento',
  'Description': 'Descrição',
  'Measure': 'Medida',
  'Length (mm)': 'Comprimento (mm)',
  'Cut Length (mm)': 'Comprimento de Corte (mm)',
  'Left Trim (mm)': 'Aparo Esquerdo (mm)',
  'Right Trim (mm)': 'Aparo Direito (mm)',
  'Minimum Offcut (mm)': 'Retalho Mínimo (mm)',
  'Order': 'Ordem',
  'Color': 'Cor',
  'Draft': 'Rascunho',
  'Draft · enter Cutting Sheet data and materials': 'Rascunho · informe os dados e materiais da Folha de Corte',
  'Choose a language': 'Escolha um idioma',
  'Language preference saved.': 'Preferência de idioma salva.',
  'Could not change the application language.': 'Não foi possível alterar o idioma do aplicativo.',
  'Organize equipment families, configurations and physical project TAGs.': 'Organize famílias, configurações e TAGs físicas dos equipamentos do projeto.',
  'All Shop Drawings': 'Todos os desenhos',
  'All destinations': 'Todos os destinos',
  'All materials': 'Todos os materiais',
  'Materials (': 'Materiais (',
  'Cut Sheets': 'Folhas de Corte',
  'Optimization Result': 'Resultado da Otimização',
  'Print / PDF': 'Imprimir / PDF',
  'Link to Workpack': 'Vincular ao Workpack',
  'Data on bar': 'Dados na barra',
  'Mark': 'Marca',
  'DRAFT · enter Cutting Sheet data and materials': 'RASCUNHO · informe os dados e materiais da Folha de Corte',
  'DRAFT': 'RASCUNHO',
  'Save draft': 'Salvar rascunho',
  'Optimize': 'Otimizar',
  'Select an active project': 'Selecione um projeto ativo',
  'Stock strategy': 'Estratégia de Estoque',
  'Date': 'Data',
  'Step 1': 'Etapa 1',
  'Step 2': 'Etapa 2',
  'Import Excel': 'Importar Excel',
  'IndexedDB Inventory': 'Inventário IndexedDB',
  'Import Coupon Materials': 'Importar materiais do cupom',
  'Add bar': 'Adicionar barra',
  'Qty': 'Qtd.',
  'Heat': 'Corrida',
  'Traceability': 'Rastreabilidade',
  'Required parts': 'Peças requeridas',
  'Import MTO': 'Importar MTO',
  'Add part': 'Adicionar peça',
  'Export options': 'Exportação',
  'Export Results': 'Exportar Resultados',
  'Workshop Cutting Sheet PDF': 'Ficha de Corte PDF',
  'Spreadsheet with calculated nesting data.': 'Planilha com dados calculados do nesting.',
  'Navigation': 'Navegação principal',
  'Menu': 'Menu',
  'Search by TAG, type, service, drawing or name...': 'Buscar por TAG, tipo, serviço, desenho ou nome...',
  'Search by WP No, title, drawing, discipline, project or equipment...': 'Buscar por WP No, titulo, drawing, disciplina, projeto ou equipamento...',
  'Search by Shop Drawing, Design Drawing, link, revision, title, project or equipment...': 'Buscar por Shop Drawing, Design Drawing, link, revisão, título, projeto ou equipamento...',
  'Material Coupon view': 'Visualização do Material Coupon',
  'Coupon filters': 'Filtros de cupons',
  'More result actions': 'Mais ações do resultado',
  'Result display settings': 'Configurações de visualização do resultado',
  'Report options': 'Opções do relatório',
  'Information displayed inside pieces': 'Informações exibidas dentro das peças',
  'Cut execution order': 'Ordem de execução do corte',
  'Piece mark': 'Marca da peça',
  'Piece position': 'Posição da peça',
  'Nominal length and allowance': 'Comprimento nominal e sobremetal',
  'Report color scheme': 'Esquema de cores do relatório',
  'Text size inside pieces': 'Tamanho do texto dentro das peças',
  'More Cutting Sheet actions': 'Mais ações do Cutting Sheet',
  'Legacy Workpack text': 'Texto legado do Workpack',
  'Select or enter the number': 'Selecione ou informe o número',
  'Add stock bar': 'Adicionar barra de estoque',
  'Issue': 'Emitir',
  'Documents': 'Documentos',
  'Local History': 'Histórico Local',
  'Export Audit': 'Exportar Auditoria',
  'Export CSV': 'Exportar CSV',
  'Fix aliases': 'Corrigir aliases',
  'Nesting Defaults': 'Padrões de Nesting',
  'Material Catalog': 'Catálogo de Materiais',
  'Returned Material Voucher': 'Vale de Devolução de Material',
  'Data and Backup': 'Dados e Backup',
  'About': 'Sobre',
  'Settings sections': 'Seções de configurações',
  'Material Readiness': 'Prontidão de Materiais',
  'CAN WE FABRICATE TODAY?': 'PODEMOS FABRICAR HOJE?',
  'All projects · select an active project for an accurate operational decision': 'Todos os projetos · selecione um projeto ativo para uma decisão operacional precisa',
  'Search anything: TAG, IDENT CODE, Traceability, Heat, PO, MTO, Workpack, Coupon, Cutting Sheet...': 'Pesquise qualquer item: TAG, IDENT CODE, Rastreabilidade, Corrida, PO, MTO, Workpack, Coupon, Cutting Sheet...',
  'Search anything': 'Pesquisar qualquer item',
  'Material Availability': 'Disponibilidade de Material',
  'MTO demand coverage': 'Cobertura da demanda MTO',
  'Critical Items': 'Itens Críticos',
  'Insufficient coverage': 'Sem cobertura suficiente',
  'PO Delayed': 'POs Atrasadas',
  'Items past their delivery date': 'Itens com entrega vencida',
  'Ready Workpacks': 'Workpacks Prontos',
  'Workpacks linked to a ready TAG': 'Workpacks ligados a TAG pronta',
  'Ready Equipment': 'Equipamentos Prontos',
  'TAGs ready for fabrication': 'TAGs prontas para fabricar',
  'Blocked Equipment': 'Equipamentos Bloqueados',
  'TAGs with a critical item': 'TAGs com item crítico',
  'Ready': 'Pronto',
  'Partial': 'Parcial',
  'Blocked': 'Bloqueado',
  'Not planned': 'Não planejado',
  'Equipment Readiness': 'Prontidão dos Equipamentos',
  'Physical TAG decision. Open a row to access the equipment operational context.': 'Decisão por TAG física. Abra uma linha para acessar o contexto operacional do equipamento.',
  'Availability': 'Disponibilidade',
  'Demand': 'Demanda',
  'Critical items': 'Itens críticos',
  'No TAG with MTO demand is available for evaluation.': 'Nenhuma TAG com demanda MTO disponível para avaliar.',
  'Calculating availability by TAG...': 'Calculando disponibilidade por TAG...',
  'Could not calculate operational readiness.': 'Não foi possível calcular a prontidão operacional.',
  'Search documents': 'Buscar documentos',
  'All document types': 'Todos os tipos de documento',
  'Document Type': 'Tipo de Documento',
  'Document Number': 'Número do Documento',
  'Updated': 'Atualizado',
  'Source': 'Origem',
  'No real document records found.': 'Nenhum registro de documento real encontrado.',
  'Unassigned': 'Não atribuído',
  'Invalid or missing date': 'Data inválida ou ausente',
  'Loading documents...': 'Carregando documentos...',
  'Unable to load the Document Register.': 'Não foi possível carregar o Registro de Documentos.',
  'MTO demand': 'Demanda MTO',
  'Issue & Workpack': 'Emissão e Workpack',
  'Cutting': 'Corte',
  'Fabrication output': 'Saída de fabricação',
  'Returned stock': 'Estoque devolvido',
  'Drawing': 'Desenho',
  'Purchase Order': 'Pedido de Compra',
  'PO Item': 'Item da PO',
  'Returned Inventory': 'Estoque Devolvido',
  'Cutting Sheet': 'Folha de Corte',
  'Cut Part': 'Peça Cortada',
  'Offcut': 'Retalho',
  'automatic': 'automático',
  'Full history': 'Histórico completo',
  'No stock movement or audit event is linked to this material chain yet.': 'Nenhum movimento de estoque ou evento de auditoria está vinculado a esta cadeia de material.',
  'No date': 'Sem data',
  'Physical material genealogy': 'Genealogia física do material',
  'Open equipment': 'Abrir equipamento',
  'Open module': 'Abrir módulo',
  'Related records': 'Registros relacionados',
  'Explicit links': 'Vínculos explícitos',
  'IDENT CODE matches': 'Correspondências de IDENT CODE',
  'Where used': 'Onde utilizado',
  'Material flow': 'Fluxo do material',
  'Source / upstream': 'Origem / upstream',
  'No direct upstream record found.': 'Nenhum registro direto de origem encontrado.',
  'Where used?': 'Onde foi utilizado?',
  'No direct downstream use found.': 'Nenhum uso direto downstream encontrado.',
  'Solid links come from persisted document references. “Automatic” links are MTO ↔ PO candidates matched by IDENT CODE.': 'Vínculos sólidos vêm de referências persistidas nos documentos. Vínculos “automáticos” são candidatos MTO ↔ PO correspondidos por IDENT CODE.',
  'Select a record to inspect its complete material flow and Where Used relationships.': 'Selecione um registro para inspecionar o fluxo completo do material e as relações de uso.',
  'Material Genealogy': 'Genealogia de Materiais',
  'Summary': 'Resumo',
  'Generated at': 'Gerado em',
  'Table {number}': 'Tabela {number}',
  '{count} record(s) in the selected scope.': '{count} registro(s) no escopo selecionado.',
  'Executive and operational summary for the selected scope.': 'Resumo executivo e operacional do escopo selecionado.',
  'No indicators available for this report.': 'Nenhum indicador disponível para este relatório.',
  'Created at': 'Criada em',
  'Mark / Spool': 'Marca / Spool',
  'Position': 'Posição',
  'Piece quantity': 'Quantidade de peças',
  'Nominal length (mm)': 'Comprimento nominal (mm)',
  'Allowance (mm)': 'Sobremetal (mm)',
  'Total cutting length (mm)': 'Comprimento total de corte (mm)',
  'Piece material': 'Material da peça',
  'Stock material grade': 'Grau do material em estoque',
  'Source material / Bar': 'Material / Barra de origem',
  'Equipment TAG': 'TAG do equipamento',
  'Equipment location': 'Localização do equipamento',
  'MTO link': 'Vínculo com MTO',
  'Material Offcuts': 'Sobras de Material',
  'Classification': 'Classificação',
  'Operational status': 'Status operacional',
  'Offcut traceability': 'Rastreabilidade da sobra',
  'Source traceability': 'Rastreabilidade de origem',
  'Destination / Disposition': 'Destino / Disposição',
  'Created': 'Gerada em',
  'Updated at': 'Atualizada em',
  'Responsible': 'Responsável',
  'Issued': 'Emitida',
  'Cut': 'Cortada',
  'Cancelled': 'Cancelada',
  'Closed': 'Encerrada',
  'In progress': 'Em execução',
  'Linked': 'Vinculado',
  'Not linked': 'Não vinculado',
  'Reusable': 'Reaproveitável',
  'Waiting for cutting confirmation': 'Aguardando confirmação do corte',
  'Available for disposition': 'Disponível para destinação',
  'Linked to RMV': 'Vinculada a RMV',
  'Returned to stock': 'Retornada ao estoque',
  'Scrap confirmed': 'Scrap confirmado',
  'Operational stock': 'Estoque operacional',
  'Waiting for fiscal return': 'Aguardando retorno fiscal',
  'CUTTING SHEETS — OPERATIONAL SUMMARY': 'RESUMO OPERACIONAL — FOLHAS DE CORTE',
  'CUTTING SHEETS — OPERATIONAL TRACEABILITY': 'FOLHAS DE CORTE — RASTREABILIDADE OPERACIONAL',
  'MATERIAL OFFCUTS — REUSABLE AND SCRAP': 'SOBRAS DE MATERIAL — REAPROVEITÁVEL E SCRAP',
  'Exported parts': 'Peças exportadas',
  'Reusable offcuts': 'Sobras reaproveitáveis',
  'Reusable length (mm)': 'Comprimento reaproveitável (mm)',
  'Scrap length (mm)': 'Comprimento de scrap (mm)',
  '{count} exported piece(s). Length values remain numeric in millimeters.': '{count} peça(s) exportada(s). Valores de comprimento permanecem numéricos em milímetros.',
  '{count} registered offcut(s). Reusable ≥ 500 mm; Scrap < 500 mm.': '{count} sobra(s) registrada(s). Reaproveitável ≥ 500 mm; Scrap < 500 mm.',
  'Operational rule: offcuts of 500 mm or more are reusable; offcuts below 500 mm are classified as scrap.': 'Regra operacional: sobras com 500 mm ou mais são reaproveitáveis; sobras abaixo de 500 mm são classificadas como scrap.',
  'Indicator': 'Indicador',
  'Value': 'Valor',
  'Unit': 'Unidade',
  'Not started': 'Não iniciado',
  'Complete': 'Completo',
  'Overdue': 'Atrasado',
  'On time': 'No prazo',
  'Sheet owner': 'Responsável pela Folha',
  'PHASE 1': 'FASE 1',
  'Page': 'Página',
  'No records.': 'Sem registros.',
  'No chart available for this presentation.': 'Sem gráfico disponível para esta apresentação.',
  'Executive Dashboard': 'Dashboard Executivo',
  'What can we fabricate today?': 'O que podemos fabricar hoje?',
  'What am I able to fabricate today?': 'O que eu consigo fabricar hoje?',
  'How much material has already arrived?': 'Quanto material já chegou?',
  'Receiving': 'Recebimento',
  'Received Weight': 'Peso Recebido',
  'Missing Weight': 'Peso Faltante',
  'MTO covered': 'MTO coberta',
  'Available materials vs required': 'Materiais disponíveis x requeridos',
  'Fully covered material groups': 'Grupos de material totalmente cobertos',
  'Available weight': 'Peso disponível',
  'Missing weight': 'Peso faltante',
  'Pending POs': 'POs pendentes',
  'Total purchased': 'Total comprado',
  'Total received': 'Total recebido',
  'Received weight': 'Peso recebido',
  'Open POs': 'POs abertas',
  'Issued MIRs': 'MIR emitidos',
  'Top 10 missing items': 'Top 10 itens em falta',
  'Top 10 critical materials': 'Top 10 materiais críticos',
  'Top 10 overdue POs': 'Top 10 POs atrasadas',
  'Top 10 shortages': 'Top 10 faltas',
  'Receipts by week': 'Recebimentos por semana',
  'PO Received vs Pending': 'PO Recebido x Pendente',
  'Complete PO item status': 'Status completo dos itens de PO',
  'Required': 'Requerido',
  'Available': 'Disponível',
  'Today shortage': 'Falta hoje',
  'Missing weight (kg)': 'Peso faltante (kg)',
  'In transit': 'Em trânsito',
  'Not covered': 'Sem cobertura',
  'Expected delivery': 'Entrega prevista',
  'Days overdue': 'Dias em atraso',
  'Pending': 'Pendente',
  'Ordered': 'Pedido',
  'Received': 'Recebido',
  'Deadline': 'Prazo',
  'ISO week': 'Semana ISO',
  'Year': 'Ano',
  'Receipts': 'Recebimentos',
  'Received quantities': 'Quantidades recebidas',
  'Weight (kg)': 'Peso (kg)',
  'Purchased': 'Comprado',
  'Weight-based MTO': 'Base: peso MTO',
  'Quantity-based MTO': 'Base: quantidade MTO',
  'Procurement Summary': 'Resumo de Suprimentos',
  'PROCUREMENT — OPERATIONAL SUMMARY': 'SUPRIMENTOS — RESUMO OPERACIONAL',
  'Consolidated quantities and arrival status by Purchase Order and unit of measure.': 'Quantidades consolidadas e situação de chegada por Purchase Order e unidade de medida.',
  'Purchase Orders': 'Purchase Orders',
  'PURCHASE ORDERS — MASTER DATA': 'PURCHASE ORDERS — DADOS MESTRES',
  'Operational Purchase Order references without internal system identifiers.': 'Referências operacionais das Purchase Orders sem identificadores internos do sistema.',
  'PO Items': 'Itens da PO',
  'PURCHASE ORDER ITEMS': 'ITENS DAS PURCHASE ORDERS',
  'Ordered, received, accepted and pending quantities by PO item.': 'Quantidades pedidas, recebidas, aceitas e pendentes por item da PO.',
  'MATERIAL RECEIPTS': 'RECEBIMENTOS DE MATERIAL',
  'Receipt, invoice, quality and delivered quantity records.': 'Registros de recebimento, nota fiscal, qualidade e quantidade entregue.',
  'Material Units': 'Unidades de Material',
  'RECEIVED MATERIAL UNITS': 'UNIDADES FÍSICAS RECEBIDAS',
  'Physical traceability, dimensions, stock status and storage position.': 'Rastreabilidade física, dimensões, situação em estoque e posição de armazenagem.',
  'PO Revisions': 'Revisões da PO',
  'PURCHASE ORDER REVISION HISTORY': 'HISTÓRICO DE REVISÕES DAS PURCHASE ORDERS',
  'Revision history represented by operational references.': 'Histórico de revisões representado por referências operacionais.',
  'PO Number': 'Número da PO',
  'PO Rev.': 'Rev. da PO',
  'Vendor Code': 'Código do fornecedor',
  'Vendor': 'Fornecedor',
  'Subject / Task': 'Objeto / Serviço',
  'PO Doc. Date': 'Data do documento da PO',
  'PO Status': 'Status da PO',
  'Currency': 'Moeda',
  'Source System': 'Sistema de origem',
  'Buyer': 'Comprador',
  'Procurement Office': 'Escritório de Suprimentos',
  'Items': 'Itens',
  'Units': 'Unidades',
  'Created At': 'Criado em',
  'Updated At': 'Atualizado em',
  'PO Item': 'Item da PO',
  'Material Code': 'Código do material',
  'Traceability': 'Rastreabilidade',
  'Equipment Destination': 'Equipamento de destino',
  'Item Classification': 'Classificação do item',
  'Item Type': 'Tipo do item',
  'Item Description': 'Descrição do item',
  'Material Description': 'Descrição do material',
  'Diameter O.D. [mm]': 'Diâmetro O.D. [mm]',
  'Thickness [mm]': 'Espessura [mm]',
  'Material Grade': 'Grau do material',
  'Length/Area': 'Comprimento/Área',
  'Length/Area Unit': 'Unidade de comprimento/área',
  'PO Quantity': 'Quantidade da PO',
  'PO Unit': 'Unidade da PO',
  'Unit Price': 'Preço unitário',
  'Contractual Delivery': 'Entrega contratual',
  'Expected Delivery': 'Entrega prevista',
  'Arrival %': '% recebido',
  'Accepted': 'Aceito',
  'Rejected': 'Rejeitado',
  'Reserved': 'Reservado',
  'Issued': 'Emitido',
  'Consumed': 'Consumido',
  'Returned': 'Devolvido',
  'Pending Arrival': 'Pendente de chegada',
  'Pending QC': 'Pendente de qualidade',
  'Item Status': 'Status do item',
  'Source File': 'Arquivo de origem',
  'Receipt Number': 'Número do recebimento',
  'Receipt Status': 'Status do recebimento',
  'Arrival Date': 'Data de recebimento',
  'Invoice / NF': 'Nota fiscal [NF]',
  'Delivery Note': 'Nota de entrega',
  'Packing List': 'Packing List',
  'Warehouse': 'Armazém',
  'Received Qty': 'Quantidade recebida',
  'Unit': 'Unidade',
  'Heat Number': 'Número da corrida',
  'Supplier Batch': 'Lote do fornecedor',
  'QC Status': 'Status de qualidade',
  'Visual Condition': 'Condição visual',
  'Visual OK': 'Visual OK',
  'Marking OK': 'Marcação OK',
  'Docs OK': 'Documentos OK',
  'Qty OK': 'Quantidade OK',
  'Remarks': 'Observações',
  'Supplier': 'Fornecedor',
  'Manufacturer': 'Fabricante',
  'Physical Traceability': 'Rastreabilidade física',
  'Diameter [mm]': 'Diâmetro [mm]',
  'Length [mm]': 'Comprimento [mm]',
  'Width [mm]': 'Largura [mm]',
  'Weight [kg]': 'Peso [kg]',
  'Inventory Status': 'Status no estoque',
  'Posting Status': 'Status de lançamento',
  'Storage Location': 'Local de armazenagem',
  'Inventory Reference': 'Referência no estoque',
  'Posted At': 'Lançado em',
  'Posted By': 'Lançado por',
  'Issue Date': 'Data de emissão',
  'Current Revision': 'Revisão atual',
  'Document Reference': 'Referência do documento',
  'Supersedes Revision': 'Substitui a revisão',
  'Missing Arrival': 'Falta chegar',
  'Missing %': '% faltante',
  'Consumed %': '% consumido',
  'Yes': 'Sim',
  'No': 'Não',
});

const ATTRIBUTE_NAMES = Object.freeze(['placeholder', 'title', 'aria-label', 'data-section-title']);
const SKIP_SELECTOR = [
  'script',
  'style',
  'template',
  'tbody',
  'option:not([value=""])',
  '[contenteditable="true"]',
  '[data-i18n-skip]',
  '[data-active-project-label]',
  '[data-active-user-name]',
  '[data-active-user-role]',
  '.dashboard-search-results',
  '.genealogy-result-list',
].join(', ');
const SOURCE_ALIASES = Object.freeze({
  'Cadastre os Shop Drawings do Technical Office; a referência do Design Drawing vem do Equipment.': 'Register Technical Office Shop Drawings; the Design Drawing reference comes from the Equipment.',
  'Control Database (Emitidos)': 'Control Database (Issued)',
  'Control Database — Materiais Emitidos': 'Document Register — Issued Materials',
  'Linhas dos Material Coupons emitidos, enriquecidas pelos RMVs vinculados ao material de origem.': 'Issued Material Coupon lines enriched with RMVs linked to the source material.',
  'Gerencie retalhos, disposição de materiais e Return Material Vouchers em um único fluxo.': 'Manage offcuts, material disposition and Return Material Vouchers in a single flow.',
  'Resultado da Otimizacao': 'Optimization Result',
  'RASCUNHO · informe os dados e materiais do Cutting Sheet': 'Draft · enter Cutting Sheet data and materials',
  'RASCUNHO': 'Draft',
  'Configuracoes': 'Settings',
  'Todos os drawings': 'All Shop Drawings',
  'Estrategia de Estoque': 'Stock strategy',
  'Inventario IndexedDB': 'IndexedDB Inventory',
  'Importar Materiais do Coupon': 'Import Coupon Materials',
  'Exportacao': 'Export options',
  'Aparo Esq. (mm)': 'Left Trim (mm)',
  'Aparo Dir. (mm)': 'Right Trim (mm)',
  'Comp. (mm)': 'Length (mm)',
  'Comp. Corte (mm)': 'Cut Length (mm)',
  'Escolha o formato de saida do plano otimizado.': 'Choose the output format for the optimized plan.',
  'Relatorio Visual PDF': 'Visual Report PDF',
  'Resumo tabular para conferencia e fabricacao.': 'Tabular summary for checking and fabrication.',
  'Ficha detalhada por barra para oficina.': 'Detailed bar sheet for the workshop.',
  'Templates Pimaco A4 e Carta com identificação e rastreabilidade.': 'Pimaco A4 and Letter templates with identification and traceability.',
  'Navegacao principal': 'Main navigation',
  'Opcoes do relatorio': 'Report options',
  'Acoes': 'Actions',
  'Titulo': 'Title',
  'Revise o aproveitamento, cortes e sobras antes de exportar.': 'Review utilization, cuts and leftovers before exporting.',
  'Novo Cutting Sheet': 'New Cutting Sheet',
  'Emitir Cutting Sheet': 'Issue Cutting Sheet',
  'Gerar Material Coupon': 'Generate Material Coupon',
  'Carregar Cutting Sheet': 'Load Cutting Sheet',
  'Identificação do Cutting Sheet': 'Cutting Sheet identification',
  'Número do Cutting Sheet': 'Cutting Sheet number',
  'Retalho Min. (mm)': 'Minimum Offcut (mm)',
  'Descricao': 'Description',
  'Padroes de Nesting': 'Nesting Defaults',
  'Catalogo de Materiais': 'Material Catalog',
  'Relatorios': 'Reports',
  'Dados e Backup': 'Data and Backup',
  'Sobre': 'About',
  'Secoes de configuracoes': 'Settings sections',
});
const translatableRecords = [];
const registeredTextNodes = new WeakSet();
const registeredAttributes = new WeakMap();

let currentLanguage = DEFAULT_LANGUAGE;
let translationObserver = null;

const portugueseToEnglish = new Map();
Object.entries(PT_BR).forEach(([english, portuguese]) => {
  if (!portugueseToEnglish.has(portuguese)) portugueseToEnglish.set(portuguese, english);
});

export function normalizeLanguage(language) {
  const normalized = String(language || '').trim().replace('_', '-').toLowerCase();
  return normalized === 'en' || normalized.startsWith('en-') ? 'en' : DEFAULT_LANGUAGE;
}

function translationKey(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (Object.hasOwn(SOURCE_ALIASES, text)) return SOURCE_ALIASES[text];
  if (Object.hasOwn(PT_BR, text)) return text;
  return portugueseToEnglish.get(text) || '';
}

function interpolate(value, variables = {}) {
  return String(value).replace(/\{(\w+)\}/g, (match, name) => (
    Object.hasOwn(variables, name) ? String(variables[name]) : match
  ));
}

export function t(value, variables = {}, language = currentLanguage) {
  const key = translationKey(value) || String(value || '');
  const translated = normalizeLanguage(language) === 'en' ? key : (PT_BR[key] || key);
  return interpolate(translated, variables);
}

export function getCurrentLanguage() {
  return currentLanguage;
}

function applyRecord(record) {
  const translated = t(record.key);
  const target = record.type === 'text' ? record.node : record.element;
  record.wasConnected ||= Boolean(target.isConnected);
  if (record.type === 'text') {
    record.node.nodeValue = `${record.prefix}${translated}${record.suffix}`;
    return;
  }
  record.element.setAttribute(record.attribute, translated);
}

function registerTextNode(node) {
  if (registeredTextNodes.has(node)) return;
  const value = node.nodeValue || '';
  const trimmed = value.trim();
  const key = translationKey(trimmed);
  if (!key) return;
  registeredTextNodes.add(node);
  const start = value.indexOf(trimmed);
  const record = {
    type: 'text',
    node,
    key,
    prefix: value.slice(0, start),
    suffix: value.slice(start + trimmed.length),
  };
  translatableRecords.push(record);
  applyRecord(record);
}

function registerElementAttributes(element) {
  let attributes = registeredAttributes.get(element);
  if (!attributes) {
    attributes = new Set();
    registeredAttributes.set(element, attributes);
  }
  ATTRIBUTE_NAMES.forEach((attribute) => {
    if (attributes.has(attribute) || !element.hasAttribute(attribute)) return;
    const key = translationKey(element.getAttribute(attribute));
    if (!key) return;
    attributes.add(attribute);
    const record = { type: 'attribute', element, attribute, key };
    translatableRecords.push(record);
    applyRecord(record);
  });
}

export function translateDom(root = globalThis.document) {
  if (!root) return;
  const ownerDocument = root.ownerDocument || root;
  const nodeFilter = ownerDocument.defaultView?.NodeFilter || globalThis.NodeFilter;
  if (!nodeFilter) return;
  const walker = ownerDocument.createTreeWalker(root, nodeFilter.SHOW_ELEMENT | nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.nodeType === 3 ? node.parentElement : node;
      if (parent?.closest(SKIP_SELECTOR)) return nodeFilter.FILTER_REJECT;
      if (parent?.classList?.contains('material-symbols-outlined')) return nodeFilter.FILTER_REJECT;
      return nodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === 3) registerTextNode(node);
    else if (node.nodeType === 1) registerElementAttributes(node);
    node = walker.nextNode();
  }
}

export function observeTranslations(root = globalThis.document?.body) {
  translateDom(root);
  translationObserver?.disconnect();
  const Observer = root?.ownerDocument?.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (!Observer || !root) return null;
  translationObserver = new Observer((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => translateDom(node));
    });
  });
  translationObserver.observe(root, { childList: true, subtree: true });
  return translationObserver;
}

export function setLanguage(language, { root = globalThis.document } = {}) {
  currentLanguage = normalizeLanguage(language);
  if (root?.documentElement) root.documentElement.lang = currentLanguage;
  for (let index = translatableRecords.length - 1; index >= 0; index -= 1) {
    const record = translatableRecords[index];
    const target = record.type === 'text' ? record.node : record.element;
    if (record.wasConnected && !target.isConnected) {
      translatableRecords.splice(index, 1);
      continue;
    }
    applyRecord(record);
  }
  root?.querySelectorAll?.('[data-language-selector]').forEach((selector) => {
    selector.value = currentLanguage;
  });
  const EventType = root?.defaultView?.CustomEvent || globalThis.CustomEvent;
  if (EventType) root?.dispatchEvent?.(new EventType('app:languagechange', { detail: { language: currentLanguage } }));
  return currentLanguage;
}
