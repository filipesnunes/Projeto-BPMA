import {
  ClassificacaoItemBuffetAmostra,
  CategoriaEquipamentoTemperatura,
  PrismaClient,
  StatusQualidadeOleo,
  StatusTemperaturaEquipamento,
  TipoOpcaoHigienizacao,
  TipoOpcaoTemperaturaEquipamento
} from "@prisma/client";

const prisma = new PrismaClient();

const HORTIFRUTI_OPTIONS = [
  "Alface",
  "Rúcula",
  "Agrião",
  "Tomate",
  "Cebola",
  "Cenoura",
  "Pepino",
  "Morango"
];

const PRODUTO_UTILIZADO_OPTIONS = ["Cloro"];

const TEMPERATURA_EQUIPAMENTOS = [
  {
    nome: "Câmara Fria de Resfriados",
    categoria: CategoriaEquipamentoTemperatura.REFRIGERACAO
  },
  {
    nome: "Freezer de Congelados",
    categoria: CategoriaEquipamentoTemperatura.CONGELAMENTO
  },
  {
    nome: "Balcão Térmico Quente",
    categoria: CategoriaEquipamentoTemperatura.QUENTE
  }
];

const TEMPERATURA_ACOES = [
  "Aguardar estabilização da temperatura",
  "Ajustar termostato",
  "Transferir insumos para outro equipamento",
  "Acionar manutenção",
  "Verificar vedação da porta",
  "Reavaliar temperatura após 30 minutos",
  "Descartar alimento, se aplicável"
];

const TEMPERATURA_CATEGORIAS = [
  {
    categoria: CategoriaEquipamentoTemperatura.REFRIGERACAO,
    nome: "Refrigeração",
    temperaturaIdealMin: null,
    temperaturaIdealMax: 4,
    temperaturaAlertaMin: 5,
    temperaturaAlertaMax: 8,
    temperaturaCriticaMin: 8.1,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter monitoramento e registro da temperatura.",
    acaoAlerta:
      "Aguardar estabilização da temperatura, ajustar termostato e reavaliar após 30 minutos.",
    acaoCritica:
      "Transferir insumos para outro equipamento, acionar manutenção e avaliar descarte se aplicável.",
    orientacaoCorretivaPadrao:
      "Verificar vedação da porta, ajustar termostato e reavaliar a temperatura em 30 minutos."
  },
  {
    categoria: CategoriaEquipamentoTemperatura.CONGELAMENTO,
    nome: "Congelamento",
    temperaturaIdealMin: null,
    temperaturaIdealMax: -18,
    temperaturaAlertaMin: -17,
    temperaturaAlertaMax: -14,
    temperaturaCriticaMin: -12.9,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter monitoramento e registro da temperatura.",
    acaoAlerta:
      "Ajustar termostato, manter equipamento fechado e reavaliar a temperatura após 30 minutos.",
    acaoCritica:
      "Transferir insumos para outro equipamento, acionar manutenção e avaliar descarte se aplicável.",
    orientacaoCorretivaPadrao:
      "Ajustar termostato, transferir insumos para outro equipamento e acionar manutenção se necessário."
  },
  {
    categoria: CategoriaEquipamentoTemperatura.QUENTE,
    nome: "Quente",
    temperaturaIdealMin: 80.1,
    temperaturaIdealMax: null,
    temperaturaAlertaMin: null,
    temperaturaAlertaMax: 80,
    temperaturaCriticaMin: null,
    temperaturaCriticaMax: null,
    acaoIdeal: "Manter aquecimento e monitoramento contínuo.",
    acaoAlerta:
      "Reaquecer o alimento, ajustar o equipamento e reavaliar a temperatura após 30 minutos.",
    acaoCritica:
      "Descartar alimento, se aplicável, e acionar manutenção imediatamente.",
    orientacaoCorretivaPadrao:
      "Reaquecer o alimento, verificar o equipamento e manter monitoramento contínuo."
  }
];

const TEMPERATURA_REGRAS = [
  {
    categoria: CategoriaEquipamentoTemperatura.REFRIGERACAO,
    regras: [
      {
        temperaturaMin: null,
        temperaturaMax: 4,
        status: StatusTemperaturaEquipamento.CONFORME,
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: 5,
        temperaturaMax: 8,
        status: StatusTemperaturaEquipamento.ALERTA,
        acaoCorretiva: "Ajustar termostato e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: 8.1,
        temperaturaMax: null,
        status: StatusTemperaturaEquipamento.CRITICO,
        acaoCorretiva:
          "Transferir insumos para outro equipamento e acionar manutenção.",
        ordem: 3
      }
    ]
  },
  {
    categoria: CategoriaEquipamentoTemperatura.CONGELAMENTO,
    regras: [
      {
        temperaturaMin: null,
        temperaturaMax: -18,
        status: StatusTemperaturaEquipamento.CONFORME,
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: -17,
        temperaturaMax: -14,
        status: StatusTemperaturaEquipamento.ALERTA,
        acaoCorretiva: "Ajustar termostato e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: -12.9,
        temperaturaMax: null,
        status: StatusTemperaturaEquipamento.CRITICO,
        acaoCorretiva:
          "Transferir insumos para outro equipamento e acionar manutenção.",
        ordem: 3
      }
    ]
  },
  {
    categoria: CategoriaEquipamentoTemperatura.QUENTE,
    regras: [
      {
        temperaturaMin: 80.1,
        temperaturaMax: null,
        status: StatusTemperaturaEquipamento.CONFORME,
        acaoCorretiva: "Nenhuma ação necessária.",
        ordem: 1
      },
      {
        temperaturaMin: 70,
        temperaturaMax: 79,
        status: StatusTemperaturaEquipamento.ALERTA,
        acaoCorretiva: "Ajustar equipamento e reavaliar temperatura.",
        ordem: 2
      },
      {
        temperaturaMin: null,
        temperaturaMax: 69.9,
        status: StatusTemperaturaEquipamento.CRITICO,
        acaoCorretiva: "Aquecer imediatamente ou descartar alimento.",
        ordem: 3
      }
    ]
  }
];

const OLEO_OPCOES = [
  {
    rotulo: "Óleo Adequado",
    descricao: "Óleo adequado para uso.",
    statusAssociado: StatusQualidadeOleo.ADEQUADO,
    ordem: 1
  },
  {
    rotulo: "2%",
    descricao: "Gordura começou a quebrar, mas ainda pode ser reutilizada.",
    statusAssociado: StatusQualidadeOleo.ADEQUADO,
    ordem: 2
  },
  {
    rotulo: "3,5%",
    descricao:
      "Pode utilizar se o alimento não apresentar alteração no sabor, cor ou textura.",
    statusAssociado: StatusQualidadeOleo.ATENCAO,
    ordem: 3
  },
  {
    rotulo: "5,5%",
    descricao:
      "Pode utilizar se o alimento não apresentar alterações, porém é última utilização.",
    statusAssociado: StatusQualidadeOleo.ULTIMA_UTILIZACAO,
    ordem: 4
  },
  {
    rotulo: "7%",
    descricao: "Descartar a gordura.",
    statusAssociado: StatusQualidadeOleo.DESCARTAR,
    ordem: 5
  }
];

const RECEBIMENTO_CATEGORIAS = [
  { nome: "Congelados", temperaturaMaxima: -12 },
  { nome: "Pescados", temperaturaMaxima: 3 },
  { nome: "Carnes", temperaturaMaxima: 7 },
  {
    nome: "Alimentos prontos preparados com carnes e pescados crus",
    temperaturaMaxima: 5
  },
  { nome: "Demais produtos", temperaturaMaxima: 10 },
  {
    nome: "Produtos de panificação e confeitaria com recheios refrigerados",
    temperaturaMaxima: 5
  }
];

const PLANO_LIMPEZA_DIARIO_AREAS = [
  "Almoxarifado",
  "Área de Louças",
  "Área de Polimento",
  "Cozinha Central",
  "Garde Manger",
  "Garde Menger 2",
  "Refeitório",
  "Restaurante",
  "Cozinha"
];

const BUFFET_SERVICOS = [
  { nome: "Café da manhã", ordem: 1 },
  { nome: "Almoço", ordem: 2 },
  { nome: "Café da tarde", ordem: 3 },
  { nome: "Jantar", ordem: 4 }
];

const BUFFET_ACOES_CORRETIVAS = [
  { nome: "Alimento exposto por menos de 1 hora no buffet", ordem: 1 },
  { nome: "Alimento exposto por menos de 2 horas no buffet", ordem: 2 },
  { nome: "Alimento descartado", ordem: 3 },
  { nome: "Não se aplica", ordem: 4 }
];

const BUFFET_ITENS = [
  {
    nome: "Ovos Mexidos",
    classificacao: ClassificacaoItemBuffetAmostra.QUENTE,
    servicos: ["Café da manhã"],
    ordem: 1
  },
  {
    nome: "Arroz Branco",
    classificacao: ClassificacaoItemBuffetAmostra.QUENTE,
    servicos: ["Almoço", "Jantar"],
    ordem: 2
  },
  {
    nome: "Feijão",
    classificacao: ClassificacaoItemBuffetAmostra.QUENTE,
    servicos: ["Almoço", "Jantar"],
    ordem: 3
  },
  {
    nome: "Frango Grelhado",
    classificacao: ClassificacaoItemBuffetAmostra.QUENTE,
    servicos: ["Almoço", "Jantar"],
    ordem: 4
  },
  {
    nome: "Salada Verde",
    classificacao: ClassificacaoItemBuffetAmostra.FRIO,
    servicos: ["Almoço", "Jantar"],
    ordem: 5
  },
  {
    nome: "Tomate em Fatias",
    classificacao: ClassificacaoItemBuffetAmostra.FRIO,
    servicos: ["Café da manhã", "Almoço", "Jantar"],
    ordem: 6
  },
  {
    nome: "Queijo Fatiado",
    classificacao: ClassificacaoItemBuffetAmostra.FRIO,
    servicos: ["Café da manhã", "Café da tarde"],
    ordem: 7
  },
  {
    nome: "Salmão Cru Temperado",
    classificacao: ClassificacaoItemBuffetAmostra.FRIO_CRU,
    servicos: ["Jantar"],
    ordem: 8
  }
];

async function seedHigienizacao() {
  await prisma.higienizacaoHortifrutiOpcao.createMany({
    data: [
      ...HORTIFRUTI_OPTIONS.map((nome) => ({
        tipo: TipoOpcaoHigienizacao.HORTIFRUTI,
        nome
      })),
      ...PRODUTO_UTILIZADO_OPTIONS.map((nome) => ({
        tipo: TipoOpcaoHigienizacao.PRODUTO_UTILIZADO,
        nome
      }))
    ],
    skipDuplicates: true
  });
}

async function seedControleTemperatura() {
  await prisma.controleTemperaturaEquipamentoOpcao.createMany({
    data: [
      ...TEMPERATURA_EQUIPAMENTOS.map((item) => ({
        tipo: TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO,
        nome: item.nome,
        categoriaEquipamento: item.categoria,
        ativo: true
      })),
      ...TEMPERATURA_ACOES.map((nome) => ({
        tipo: TipoOpcaoTemperaturaEquipamento.ACAO_CORRETIVA,
        nome,
        ativo: true
      }))
    ],
    skipDuplicates: true
  });

  for (const categoria of TEMPERATURA_CATEGORIAS) {
    await prisma.controleTemperaturaCategoriaParametro.upsert({
      where: { categoria: categoria.categoria },
      create: {
        ...categoria,
        isActive: true
      },
      update: {}
    });
  }

  const categorias = await prisma.controleTemperaturaCategoriaParametro.findMany({
    select: { id: true, categoria: true }
  });
  const categoriaMap = new Map(
    categorias.map((categoria) => [categoria.categoria, categoria.id])
  );

  for (const regraConfig of TEMPERATURA_REGRAS) {
    const categoriaId = categoriaMap.get(regraConfig.categoria);
    if (!categoriaId) {
      continue;
    }

    const existingRules = await prisma.controleTemperaturaCategoriaRegra.count({
      where: { categoriaId }
    });
    if (existingRules > 0) {
      continue;
    }

    await prisma.controleTemperaturaCategoriaRegra.createMany({
      data: regraConfig.regras.map((regra) => ({
        categoriaId,
        temperaturaMin: regra.temperaturaMin,
        temperaturaMax: regra.temperaturaMax,
        status: regra.status,
        acaoCorretiva: regra.acaoCorretiva,
        ordem: regra.ordem,
        isActive: true
      }))
    });
  }
}

async function seedControleOleo() {
  await prisma.controleQualidadeOleoOpcaoFita.createMany({
    data: OLEO_OPCOES.map((option) => ({
      ...option,
      ativo: true
    })),
    skipDuplicates: true
  });
}

async function seedRastreabilidade() {
  await prisma.rastreabilidadeRecebimentoCategoria.createMany({
    data: RECEBIMENTO_CATEGORIAS.map((categoria) => ({
      ...categoria,
      ativo: true
    })),
    skipDuplicates: true
  });
}

async function seedPlanoLimpeza() {
  await prisma.planoLimpezaDiarioArea.createMany({
    data: PLANO_LIMPEZA_DIARIO_AREAS.map((nome, index) => ({
      nome,
      turnoManha: true,
      turnoTarde: true,
      turnoNoite: true,
      ativo: true,
      ordem: index + 1
    })),
    skipDuplicates: true
  });
}

async function seedControleBuffetAmostras() {
  await prisma.controleBuffetAmostraServico.createMany({
    data: BUFFET_SERVICOS.map((servico) => ({
      nome: servico.nome,
      ordem: servico.ordem,
      ativo: true
    })),
    skipDuplicates: true
  });

  await prisma.controleBuffetAmostraAcaoCorretiva.createMany({
    data: BUFFET_ACOES_CORRETIVAS.map((acao) => ({
      nome: acao.nome,
      ordem: acao.ordem,
      ativo: true
    })),
    skipDuplicates: true
  });

  const servicos = await prisma.controleBuffetAmostraServico.findMany({
    select: { id: true, nome: true }
  });
  const servicoIdByName = new Map(servicos.map((servico) => [servico.nome, servico.id]));

  for (const itemConfig of BUFFET_ITENS) {
    const item = await prisma.controleBuffetAmostraItem.upsert({
      where: { nome: itemConfig.nome },
      create: {
        nome: itemConfig.nome,
        classificacao: itemConfig.classificacao,
        ordem: itemConfig.ordem,
        ativo: true
      },
      update: {}
    });

    const servicoIds = itemConfig.servicos
      .map((servicoNome) => servicoIdByName.get(servicoNome))
      .filter((servicoId): servicoId is number => typeof servicoId === "number");

    if (servicoIds.length > 0) {
      await prisma.controleBuffetAmostraItemServico.createMany({
        data: servicoIds.map((servicoId) => ({
          servicoId,
          itemId: item.id
        })),
        skipDuplicates: true
      });
    }
  }
}

async function main() {
  await seedHigienizacao();
  await seedControleTemperatura();
  await seedControleOleo();
  await seedRastreabilidade();
  await seedPlanoLimpeza();
  await seedControleBuffetAmostras();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
