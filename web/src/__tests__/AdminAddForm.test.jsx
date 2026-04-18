/**
 * Tests for AdminAddForm component — folder type support
 *
 * @aitri-trace FR-ID: FR-020, FR-024, TC-ID: TC-020h, TC-024h
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminAddForm from '../components/AdminAddForm.jsx';

// @aitri-tc TC-020h
it('TC-020h: AdminAddForm — folder option appears in type select', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  const select = screen.getByTestId('input-type');
  const options = Array.from(select.options).map(o => o.value);
  expect(options).toContain('local');
  expect(options).toContain('remote');
  expect(options).toContain('folder');
  expect(options).toHaveLength(3);
});

// @aitri-tc TC-020e
it('TC-020e: AdminAddForm — switching folder→local hides helper text and restores path label', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  const select = screen.getByTestId('input-type');

  fireEvent.change(select, { target: { value: 'folder' } });
  expect(screen.getByTestId('folder-hint')).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'local' } });
  expect(screen.queryByTestId('folder-hint')).not.toBeInTheDocument();
});

// @aitri-tc TC-020n
it('TC-020n: AdminAddForm — submitting folder type calls onSubmit with type=folder', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<AdminAddForm onSubmit={onSubmit} onCancel={vi.fn()} />);

  fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'folder' } });
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'my-workspace' } });
  fireEvent.change(screen.getByTestId('input-location'), { target: { value: '/tmp/workspace' } });
  fireEvent.click(screen.getByTestId('submit-add'));

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'my-workspace',
      type: 'folder',
      location: '/tmp/workspace',
    });
  });
});

// @aitri-tc TC-020f
it('TC-020f: AdminAddForm — location input has required attribute when type=folder', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'folder' } });
  expect(screen.getByTestId('input-location')).toBeRequired();
});

// @aitri-tc TC-024h
it('TC-024h: AdminAddForm — helper text visible when type=folder is selected', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'folder' } });
  expect(screen.getByTestId('folder-hint')).toBeInTheDocument();
});

// @aitri-tc TC-024f
it('TC-024f: AdminAddForm — helper text NOT visible when type=local is selected', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  // default is local
  expect(screen.queryByTestId('folder-hint')).not.toBeInTheDocument();
});

// @aitri-tc TC-024e
it('TC-024e: AdminAddForm — location label reads "folder path" when type=folder', () => {
  render(<AdminAddForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByTestId('input-type'), { target: { value: 'folder' } });
  expect(screen.getByText('folder path')).toBeInTheDocument();
});
