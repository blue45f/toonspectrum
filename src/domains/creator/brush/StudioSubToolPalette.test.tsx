// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { StudioSubToolPalette } from "./StudioSubToolPalette";

describe('StudioSubToolPalette', () => {
  const onSelectSubToolMock = vi.fn();
  const onCategoryChangeMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly with active category', () => {
    render(
      <StudioSubToolPalette 
        activeCategory="pen" 
        activeSubToolId="pen-g" 
        onSelectSubTool={onSelectSubToolMock} 
      />
    );
    
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('G펜')).toBeTruthy();
    expect(screen.getByText('리얼 G펜')).toBeTruthy();
  });

  it('calls onCategoryChange when a tab is clicked', () => {
    render(
      <StudioSubToolPalette 
        activeCategory="pen" 
        activeSubToolId="pen-g" 
        onSelectSubTool={onSelectSubToolMock}
        onCategoryChange={onCategoryChangeMock}
      />
    );
    
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]); // pencil
    expect(onCategoryChangeMock).toHaveBeenCalledWith('pencil');
  });

  it('calls onSelectSubTool when an option is clicked', () => {
    render(
      <StudioSubToolPalette 
        activeCategory="pen" 
        activeSubToolId="pen-g" 
        onSelectSubTool={onSelectSubToolMock} 
      />
    );
    
    fireEvent.click(screen.getByText('리얼 G펜'));
    expect(onSelectSubToolMock).toHaveBeenCalledWith('pen-real-g');
  });

  it('supports keyboard navigation (ArrowDown, ArrowUp, Enter)', () => {
    render(
      <StudioSubToolPalette 
        activeCategory="pen" 
        activeSubToolId="pen-g" 
        onSelectSubTool={onSelectSubToolMock} 
      />
    );
    
    const options = screen.getAllByRole('option');
    const firstOption = options[0];
    
    firstOption.focus();
    expect(firstOption).toEqual(document.activeElement);
    
    // Move down
    fireEvent.keyDown(firstOption, { key: 'ArrowDown' });
    expect(options[1]).toEqual(document.activeElement);
    
    // Move up
    fireEvent.keyDown(options[1], { key: 'ArrowUp' });
    expect(options[0]).toEqual(document.activeElement);
    
    // Select with Enter
    fireEvent.keyDown(options[0], { key: 'Enter' });
    expect(onSelectSubToolMock).toHaveBeenCalledWith('pen-g');
  });

  it('sets aria-selected correctly', () => {
    render(
      <StudioSubToolPalette 
        activeCategory="pen" 
        activeSubToolId="pen-real-g" 
        onSelectSubTool={onSelectSubToolMock} 
      />
    );
    
    const gPen = screen.getByText('G펜').closest('[role="option"]');
    const realGPen = screen.getByText('리얼 G펜').closest('[role="option"]');
    
    expect(gPen?.getAttribute('aria-selected')).toBe('false');
    expect(realGPen?.getAttribute('aria-selected')).toBe('true');
  });
});
