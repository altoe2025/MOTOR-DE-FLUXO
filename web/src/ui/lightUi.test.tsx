// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionMenu } from './ActionMenu';
import { Disclosure } from './Disclosure';
import { HelpTip } from './HelpTip';

describe('ActionMenu', () => {
  const setup = () => {
    const rename = vi.fn();
    const remove = vi.fn();
    render(<><ActionMenu label="Carteira A" items={[
      { label: 'Renomear', ariaLabel: 'Renomear Carteira A', onSelect: rename, helpId: 'control.x.renomear' },
      'separator',
      { label: 'Excluir', onSelect: remove, danger: true },
    ]} /><button type="button">fora</button></>);
    return { rename, remove, trigger: screen.getByRole('button', { name: 'Mais ações: Carteira A' }) };
  };

  it('só mostra os itens com o menu aberto e executa a ação escolhida', () => {
    const { rename, trigger } = setup();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: 'Renomear Carteira A' });
    expect(item).toHaveAttribute('data-chat-help-id', 'control.x.renomear');
    expect(item).toHaveFocus();
    fireEvent.click(item);
    expect(rename).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('navega com setas, fecha com Esc e com clique fora', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const [first, second] = screen.getAllByRole('menuitem');
    fireEvent.keyDown(first!, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second!, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marca ações destrutivas', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveClass('action-menu__item--danger');
  });
});

describe('Disclosure', () => {
  it('monta o conteúdo só quando aberto e informa o estado', () => {
    render(<Disclosure id="ajuste" label="Ajustar uma empresa" hint="volume, datas"><p>campos</p></Disclosure>);
    const toggle = screen.getByRole('button', { name: /Ajustar uma empresa/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'ajuste');
    expect(screen.queryByText('campos')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('campos')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('campos')).not.toBeInTheDocument();
  });

  it('pode começar aberto', () => {
    render(<Disclosure id="x" label="Detalhes" defaultOpen><p>aberto</p></Disclosure>);
    expect(screen.getByText('aberto')).toBeInTheDocument();
  });
});

describe('HelpTip', () => {
  it('mostra a explicação no foco ou clique e fecha com Esc', () => {
    render(<HelpTip label="Composição">Cria um cenário por combinação.</HelpTip>);
    const button = screen.getByRole('button', { name: 'Ajuda: Composição' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cria um cenário por combinação.');
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
