/**
 * Pagination utilities for consistent API responses
 */

/**
 * Default pagination configuration
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Request query parameters
 * @returns {Object} Parsed pagination parameters
 */
const parsePaginationParams = (query = {}) => {
  let page = parseInt(query.page, 10) || DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;

  // Ensure valid values
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(MAX_LIMIT, limit));

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip
  };
};

/**
 * Calculate pagination metadata
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} totalItems - Total number of items
 * @returns {Object} Pagination metadata
 */
const calculatePagination = (page, limit, totalItems) => {
  const totalPages = Math.ceil(totalItems / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    currentPage: page,
    itemsPerPage: limit,
    totalItems,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null
  };
};

/**
 * Create paginated response structure
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination metadata
 * @param {Object} additionalData - Additional data to include in response
 * @returns {Object} Paginated response structure
 */
const createPaginatedResponse = (data, pagination, additionalData = {}) => {
  return {
    ...additionalData,
    pagination,
    data
  };
};

/**
 * Build MongoDB aggregation pipeline for pagination
 * @param {Object} matchQuery - MongoDB match query
 * @param {Object} sortQuery - MongoDB sort query
 * @param {Object} paginationParams - Pagination parameters
 * @returns {Array} MongoDB aggregation pipeline
 */
const buildPaginationPipeline = (matchQuery = {}, sortQuery = {}, paginationParams) => {
  const { skip, limit } = paginationParams;
  
  const pipeline = [
    { $match: matchQuery }
  ];

  if (Object.keys(sortQuery).length > 0) {
    pipeline.push({ $sort: sortQuery });
  }

  pipeline.push(
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit }
        ],
        count: [
          { $count: "total" }
        ]
      }
    }
  );

  return pipeline;
};

/**
 * Process pagination results from MongoDB aggregation
 * @param {Array} results - Results from aggregation pipeline
 * @param {Object} paginationParams - Pagination parameters
 * @returns {Object} Processed pagination results
 */
const processPaginationResults = (results, paginationParams) => {
  const [{ data, count }] = results;
  const totalItems = count.length > 0 ? count[0].total : 0;
  const pagination = calculatePagination(
    paginationParams.page,
    paginationParams.limit,
    totalItems
  );

  return {
    data,
    pagination,
    totalItems
  };
};

/**
 * Simple pagination for Mongoose queries (non-aggregation)
 * @param {Object} query - Mongoose query object
 * @param {Object} paginationParams - Pagination parameters
 * @param {Object} sortQuery - Sort query
 * @returns {Promise} Promise that resolves to paginated results
 */
const paginate = async (query, paginationParams, sortQuery = {}) => {
  const { skip, limit, page } = paginationParams;
  
  const [data, totalItems] = await Promise.all([
    query.find().sort(sortQuery).skip(skip).limit(limit).exec(),
    query.countDocuments().exec()
  ]);

  const pagination = calculatePagination(page, limit, totalItems);

  return {
    data,
    pagination,
    totalItems
  };
};

/**
 * Pagination links generator for API responses
 * @param {string} baseUrl - Base URL for the API endpoint
 * @param {Object} pagination - Pagination metadata
 * @param {Object} queryParams - Additional query parameters
 * @returns {Object} Pagination links
 */
const generatePaginationLinks = (baseUrl, pagination, queryParams = {}) => {
  const { currentPage, hasNextPage, hasPrevPage, nextPage, prevPage, totalPages } = pagination;
  
  const buildUrl = (page) => {
    const params = new URLSearchParams({
      ...queryParams,
      page: page.toString()
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const links = {
    self: buildUrl(currentPage),
    first: buildUrl(1),
    last: buildUrl(totalPages)
  };

  if (hasNextPage) {
    links.next = buildUrl(nextPage);
  }

  if (hasPrevPage) {
    links.prev = buildUrl(prevPage);
  }

  return links;
};

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationParams,
  calculatePagination,
  createPaginatedResponse,
  buildPaginationPipeline,
  processPaginationResults,
  paginate,
  generatePaginationLinks
};
