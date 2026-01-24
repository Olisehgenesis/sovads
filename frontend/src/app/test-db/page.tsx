'use client'

import { useState } from 'react'

export default function TestDBPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testConnection = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/health/db')
      const data = await response.json()
      
      if (response.ok || response.status === 207) {
        setResult(data)
      } else {
        setError(`Error: ${data.message || 'Unknown error'}`)
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test connection')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-50'
      case 'error':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-yellow-600 bg-yellow-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✓'
      case 'error':
        return '✗'
      default:
        return '?'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Database Connection Test</h1>
      
      <div className="mb-6">
        <button
          onClick={testConnection}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Testing...' : 'Test Database Connection'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-semibold">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg ${getStatusColor(result.overall)}`}>
            <h2 className="text-xl font-semibold mb-2">
              Overall Status: {result.overall?.toUpperCase()}
            </h2>
            <p className="text-sm">Duration: {result.totalDuration}ms</p>
            <p className="text-sm">Message: {result.message}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Connection Test */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={getStatusColor(result.connection.status) + ' px-2 py-1 rounded'}>
                  {getStatusIcon(result.connection.status)}
                </span>
                Connection
              </h3>
              <p className="text-sm text-gray-600">
                Status: {result.connection.status}
              </p>
              <p className="text-sm text-gray-600">
                Duration: {result.connection.duration}ms
              </p>
              {result.connection.error && (
                <p className="text-sm text-red-600 mt-2">
                  Error: {result.connection.error}
                </p>
              )}
            </div>

            {/* Database Test */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={getStatusColor(result.database.status) + ' px-2 py-1 rounded'}>
                  {getStatusIcon(result.database.status)}
                </span>
                Database
              </h3>
              <p className="text-sm text-gray-600">
                Status: {result.database.status}
              </p>
              <p className="text-sm text-gray-600">
                Name: {result.database.name || 'N/A'}
              </p>
              {result.database.error && (
                <p className="text-sm text-red-600 mt-2">
                  Error: {result.database.error}
                </p>
              )}
            </div>

            {/* Collections Test */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={getStatusColor(result.collections.status) + ' px-2 py-1 rounded'}>
                  {getStatusIcon(result.collections.status)}
                </span>
                Collections
              </h3>
              <p className="text-sm text-gray-600">
                Status: {result.collections.status}
              </p>
              <p className="text-sm text-gray-600">
                Found: {result.collections.collections.length} collections
              </p>
              {result.collections.collections.length > 0 && (
                <ul className="text-xs text-gray-500 mt-2 list-disc list-inside">
                  {result.collections.collections.slice(0, 5).map((name: string) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* MongoDB URI */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Configuration</h3>
              <p className="text-sm text-gray-600">
                MongoDB URI: {result.mongodbUri || 'Not configured'}
              </p>
            </div>
          </div>

          {/* Test Queries */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-3">Collection Counts</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium">Publishers</p>
                <p className={`text-lg ${result.testQueries.publishers.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {result.testQueries.publishers.count}
                </p>
                {result.testQueries.publishers.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {result.testQueries.publishers.error}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Campaigns</p>
                <p className={`text-lg ${result.testQueries.campaigns.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {result.testQueries.campaigns.count}
                </p>
                {result.testQueries.campaigns.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {result.testQueries.campaigns.error}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Publisher Sites</p>
                <p className={`text-lg ${result.testQueries.publisherSites.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {result.testQueries.publisherSites.count}
                </p>
                {result.testQueries.publisherSites.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {result.testQueries.publisherSites.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Raw JSON */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
              View Raw JSON
            </summary>
            <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

