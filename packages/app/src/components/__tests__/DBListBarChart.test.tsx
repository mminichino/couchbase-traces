// @ts-nocheck
import React from 'react';
import { screen } from '@testing-library/react';

import DBListBarChart from '@/components/DBListBarChart';
import MVOptimizationIndicator from '@/components/MaterializedViews/MVOptimizationIndicator';
import { useQueriedChartConfig } from '@/hooks/useChartConfig';
import { useMVOptimizationExplanation } from '@/hooks/useMVOptimizationExplanation';
import { useSource } from '@/source';

// Mock dependencies
jest.mock('@/hooks/useChartConfig', () => ({
  useQueriedChartConfig: jest.fn(),
}));

jest.mock('@/hooks/useMVOptimizationExplanation', () => ({
  useMVOptimizationExplanation: jest.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
  }),
}));

jest.mock('@/source', () => ({
  useSource: jest.fn().mockReturnValue({ data: null }),
  useChartNumberFormats: jest
    .fn()
    .mockReturnValue({ formatByColumn: new Map(), chartFormat: undefined }),
}));

jest.mock('../MaterializedViews/MVOptimizationIndicator', () =>
  jest.fn(() => null),
);

jest.mock('../charts/DateRangeIndicator', () => jest.fn(() => null));

describe('DBListBarChart', () => {
  const mockUseQueriedChartConfig = useQueriedChartConfig as jest.Mock;

  const baseTestConfig = {
    dateRange: [new Date(), new Date()] as [Date, Date],
    from: { databaseName: 'test', tableName: 'test' },
    timestampValueExpression: 'timestamp',
    connection: 'test-connection',
    select: '',
    where: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseQueriedChartConfig.mockReturnValue({
      data: { data: [{ group: 'test', value: 100 }] },
      isLoading: false,
      isError: false,
    });
  });

  it('passes the same config to useMVOptimizationExplanation, useQueriedChartConfig, and MVOptimizationIndicator', () => {
    // Mock useSource to return a source so MVOptimizationIndicator is rendered
    jest.mocked(useSource).mockReturnValue({
      data: { id: 'test-source', name: 'Test Source' },
    } as any);

    renderWithMantine(
      <DBListBarChart
        config={baseTestConfig}
        valueColumn="value"
        groupColumn="group"
      />,
    );

    // Get the config that was passed to useMVOptimizationExplanation
    expect(jest.mocked(useMVOptimizationExplanation)).toHaveBeenCalled();
    const mvOptExplanationConfig = jest.mocked(useMVOptimizationExplanation)
      .mock.calls[0][0];

    // Get the config that was passed to useQueriedChartConfig
    expect(jest.mocked(useQueriedChartConfig)).toHaveBeenCalled();
    const queriedChartConfig = jest.mocked(useQueriedChartConfig).mock
      .calls[0][0];

    // Get the config that was passed to MVOptimizationIndicator
    expect(jest.mocked(MVOptimizationIndicator)).toHaveBeenCalled();
    const indicatorConfig = jest.mocked(MVOptimizationIndicator).mock
      .calls[0][0].config;

    // All three should receive the same config object reference
    expect(mvOptExplanationConfig).toBe(queriedChartConfig);
    expect(queriedChartConfig).toBe(indicatorConfig);
    expect(mvOptExplanationConfig).toBe(indicatorConfig);
  });

  describe('refresh', () => {
    const renderChart = () =>
      renderWithMantine(
        <DBListBarChart
          config={baseTestConfig}
          valueColumn="value"
          groupColumn="group"
        />,
      );

    it('pulses the previous bars while a refresh loads', () => {
      mockUseQueriedChartConfig.mockReturnValue({
        data: { data: [{ group: 'checkout', value: 100 }] },
        isLoading: false,
        isPlaceholderData: true,
        isError: false,
      });

      renderChart();

      expect(
        screen.getByText('checkout').closest('.effect-pulse'),
      ).toBeInTheDocument();
    });

    it('does not pulse once fresh bars load', () => {
      mockUseQueriedChartConfig.mockReturnValue({
        data: { data: [{ group: 'checkout', value: 100 }] },
        isLoading: false,
        isPlaceholderData: false,
        isError: false,
      });

      renderChart();

      expect(screen.getByText('checkout').closest('.effect-pulse')).toBeNull();
    });

    it('shows loading instead of the stale empty result during a refetch', () => {
      mockUseQueriedChartConfig.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        isPlaceholderData: true,
        isError: false,
      });

      renderChart();

      expect(screen.getByText('Loading Chart Data...')).toBeInTheDocument();
      expect(screen.queryByText('No data found within time range.')).toBeNull();
    });

    it('does not pulse a fresh empty result', () => {
      mockUseQueriedChartConfig.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        isPlaceholderData: false,
        isError: false,
      });

      renderChart();

      expect(
        screen.getByText('No data found within time range.'),
      ).not.toHaveClass('effect-pulse');
    });
  });
});
