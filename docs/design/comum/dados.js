/* Dados de exemplo dos protótipos. "Hoje" é quinta, 29/10/2026, 13:40. */
window.DADOS = {
  barbearia: {
    nome: 'Barbearia Canto do Corte',
    slug: 'canto-do-corte',
    bairro: 'Aldeota, Fortaleza',
    endereco: 'Rua Silva Paulet, 1520 · Aldeota',
    nota: 4.9, avaliacoes: 312,
    destaque: '#1F4E8C',
    capa: 'capa-barbearia',
    dono: 'Zé Ricardo',
    servicos: [
      { id: 'corte', nome: 'Corte masculino', preco: 45, dur: 40, foto: 'corte', desc: 'Tesoura e máquina, com lavagem e finalização.' },
      { id: 'corte-barba', nome: 'Corte + barba', preco: 70, dur: 60, foto: 'corte-barba', desc: 'O combo da casa: sai R$ 10 mais barato que separado.' },
      { id: 'barba', nome: 'Barba com toalha quente', preco: 35, dur: 30, foto: 'barba', desc: 'Navalha, toalha quente e balm no final.' },
      { id: 'pezinho', nome: 'Pezinho e desenho', preco: 20, dur: 20, foto: 'pezinho', desc: 'Acabamento na navalha e desenho simples.' },
      { id: 'hidratacao', nome: 'Hidratação de barba', preco: 30, dur: 20, foto: 'kit-barba', desc: 'Óleo e balm para a barba ficar macia.' }
    ],
    selecionados: ['corte-barba', 'pezinho'],
    profissionais: [
      { nome: 'Zé Ricardo', papel: 'Barbeiro e dono', foto: 'ze' },
      { nome: 'Davi Holanda', papel: 'Barbeiro', foto: 'davi' },
      { nome: 'Márcio Lima', papel: 'Barbeiro', foto: 'marcio' }
    ],
    profissionalEscolhido: 1,
    horarios: { manha: ['09:00', '10:20', '11:00'], tarde: ['14:00', '15:30', '16:10', '17:00'], noite: ['18:30'] },
    horarioEscolhido: '15:30',
    agenda: [
      [ ['09:00', 40, 'Rafael Sousa', 'Corte masculino', 'concluido'],
        ['10:00', 60, 'Thiago Lima', 'Corte + barba', 'concluido'],
        ['11:30', 30, 'Anderson Paiva', 'Barba com toalha quente', 'concluido'],
        ['14:00', 40, 'Pedro Henrique', 'Corte masculino', 'confirmado'],
        ['15:00', 60, 'Lucas Andrade', 'Corte + barba', 'confirmado'],
        ['17:00', 20, 'Caio Monteiro', 'Pezinho e desenho', 'pendente'] ],
      [ ['09:30', 60, 'Marcos Vinícius', 'Corte + barba', 'concluido'],
        ['13:30', 40, 'João Victor', 'Corte masculino', 'confirmado'],
        ['14:30', 30, 'Felipe Rocha', 'Barba com toalha quente', 'pendente'],
        ['16:00', 40, 'Gabriel Matos', 'Corte masculino', 'confirmado'],
        ['18:00', 60, 'Bruno Alves', 'Corte + barba', 'confirmado'] ],
      [ ['10:00', 40, 'Ícaro Bezerra', 'Corte masculino', 'concluido'],
        ['11:00', 20, 'Renan Castro', 'Hidratação de barba', 'cancelado'],
        ['15:30', 40, 'Diego Freitas', 'Corte masculino', 'confirmado'],
        ['16:30', 60, 'Wesley Nunes', 'Corte + barba', 'confirmado'] ]
    ],
    semana: { agendamentos: 86, receita: 4930, ocupacao: 78, novos: 12, porDia: [9, 12, 14, 15, 17, 19] },
    financeiro: {
      receita: 14860, anterior: 13270, atendimentos: 328, aReceber: 1240, cancelamentos: 9, perdido: 420,
      porServico: [['Corte + barba', 6160, 88], ['Corte masculino', 5220, 116], ['Barba com toalha quente', 1820, 52], ['Pezinho e desenho', 1000, 50], ['Hidratação de barba', 660, 22]],
      porProfissional: [['Zé Ricardo', 5940], ['Davi Holanda', 5120], ['Márcio Lima', 3800]],
      recentes: [['29/10 11:30', 'Anderson Paiva', 'Barba com toalha quente', 'Zé Ricardo', 35], ['29/10 10:00', 'Thiago Lima', 'Corte + barba', 'Zé Ricardo', 70], ['29/10 10:00', 'Ícaro Bezerra', 'Corte masculino', 'Márcio Lima', 45], ['29/10 09:30', 'Marcos Vinícius', 'Corte + barba', 'Davi Holanda', 70], ['29/10 09:00', 'Rafael Sousa', 'Corte masculino', 'Zé Ricardo', 45], ['28/10 18:00', 'Hugo Barreto', 'Corte + barba', 'Davi Holanda', 70]]
    }
  },
  salao: {
    nome: 'Studio Lume',
    slug: 'studio-lume',
    bairro: 'Meireles, Fortaleza',
    endereco: 'Av. Antônio Justa, 2780 · Meireles',
    nota: 4.8, avaliacoes: 527,
    destaque: '#7A2238',
    capa: 'capa-salao',
    dono: 'Carla Menezes',
    servicos: [
      { id: 'escova', nome: 'Escova modelada', preco: 60, dur: 45, foto: 'escova', desc: 'Lavagem, escova e finalização com protetor térmico.' },
      { id: 'corte', nome: 'Corte feminino', preco: 90, dur: 60, foto: 'corte-feminino', desc: 'Conversa antes do corte, lavagem e escova simples.' },
      { id: 'mechas', nome: 'Mechas e iluminado', preco: 380, dur: 180, foto: 'mechas', desc: 'Preço a partir de; o valor final depende do comprimento.', aPartir: true },
      { id: 'hidratacao', nome: 'Hidratação profunda', preco: 80, dur: 50, foto: 'hidratacao', desc: 'Máscara de tratamento com vapor e massagem.' },
      { id: 'unhas', nome: 'Manicure e pedicure', preco: 65, dur: 75, foto: 'unhas', desc: 'Cutilagem, esmaltação e hidratação dos pés.' },
      { id: 'cachos', nome: 'Finalização de cachos', preco: 110, dur: 60, foto: 'cachos', desc: 'Lavagem, fitagem e difusor para cachos definidos.' }
    ],
    selecionados: ['corte', 'hidratacao'],
    profissionais: [
      { nome: 'Carla Menezes', papel: 'Cabelo e corte', foto: 'carla' },
      { nome: 'Juliana Pires', papel: 'Unhas', foto: 'juliana' },
      { nome: 'Priscila Rocha', papel: 'Coloração', foto: 'priscila' }
    ],
    profissionalEscolhido: 0,
    horarios: { manha: ['08:30', '11:00'], tarde: ['13:00', '14:00', '15:40'], noite: ['17:30', '18:20'] },
    horarioEscolhido: '15:40',
    agenda: [
      [ ['09:00', 45, 'Ana Beatriz', 'Escova modelada', 'concluido'],
        ['10:00', 60, 'Mariana Costa', 'Corte feminino', 'concluido'],
        ['14:00', 50, 'Letícia Moura', 'Hidratação profunda', 'confirmado'],
        ['15:00', 60, 'Camila Rocha', 'Corte feminino', 'confirmado'],
        ['16:30', 60, 'Jéssica Tavares', 'Finalização de cachos', 'pendente'] ],
      [ ['09:30', 75, 'Fernanda Alencar', 'Manicure e pedicure', 'concluido'],
        ['11:00', 75, 'Patrícia Gomes', 'Manicure e pedicure', 'concluido'],
        ['14:30', 75, 'Larissa Pinheiro', 'Manicure e pedicure', 'confirmado'],
        ['16:00', 75, 'Bianca Freire', 'Manicure e pedicure', 'cancelado'],
        ['17:30', 75, 'Débora Sales', 'Manicure e pedicure', 'confirmado'] ],
      [ ['09:00', 180, 'Renata Araújo', 'Mechas e iluminado', 'concluido'],
        ['13:30', 180, 'Vanessa Lima', 'Mechas e iluminado', 'confirmado'],
        ['17:00', 50, 'Aline Barros', 'Hidratação profunda', 'pendente'] ]
    ],
    semana: { agendamentos: 64, receita: 6420, ocupacao: 71, novos: 9, porDia: [7, 9, 10, 12, 13, 13] },
    financeiro: {
      receita: 21450, anterior: 19980, atendimentos: 215, aReceber: 2310, cancelamentos: 6, perdido: 515,
      porServico: [['Mechas e iluminado', 6840, 18], ['Corte feminino', 5760, 64], ['Escova modelada', 4200, 70], ['Manicure e pedicure', 2600, 40], ['Hidratação profunda', 1280, 16], ['Finalização de cachos', 770, 7]],
      porProfissional: [['Carla Menezes', 9300], ['Priscila Rocha', 8160], ['Juliana Pires', 3990]],
      recentes: [['29/10 11:00', 'Patrícia Gomes', 'Manicure e pedicure', 'Juliana Pires', 65], ['29/10 10:00', 'Mariana Costa', 'Corte feminino', 'Carla Menezes', 90], ['29/10 09:30', 'Fernanda Alencar', 'Manicure e pedicure', 'Juliana Pires', 65], ['29/10 09:00', 'Renata Araújo', 'Mechas e iluminado', 'Priscila Rocha', 420], ['29/10 09:00', 'Ana Beatriz', 'Escova modelada', 'Carla Menezes', 60], ['28/10 17:30', 'Sabrina Melo', 'Corte feminino', 'Carla Menezes', 90]]
    }
  }
};
